/**
 * Standalone WebSocket server — runs on WS_PORT (default 3001)
 * Handles real-time chat: messages, AI streaming, typing indicators,
 * pause/resume/takeover controls, and room-based broadcasting.
 *
 * Run with: npx tsx server/ws.ts
 */

import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { IncomingMessage } from "http";
import { verifyAccessToken } from "../lib/auth/jwt";
import { jwtVerify } from "jose";
import { prisma } from "../lib/db/prisma";
import { getAIProvider } from "../lib/ai";
import type { ConversationContext } from "../lib/ai/types";
import { checkResponse, SAFE_FALLBACK } from "../lib/ai/guardrails";
import { guessCategory } from "../lib/auto-tagger";
import { createNotifications } from "../lib/notifications";
import { perf } from "../lib/perf";
import { getWorkspaceSetting } from "../lib/workspace-cache";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClientRole = "agent" | "user";

interface AuthenticatedClient {
  ws: WebSocket;
  role: ClientRole;
  agentId?: string;
  userId?: string; // external user ID
  rooms: Set<string>; // conversationIds
}

type ServerEvent =
  | { type: "message"; payload: MessagePayload }
  | { type: "ai_chunk"; payload: AiChunkPayload }
  | { type: "ai_done"; payload: { conversationId: string; messageId: string } }
  | { type: "ai_correction"; payload: { conversationId: string; messageId: string; content: string } }
  | { type: "typing"; payload: TypingPayload }
  | { type: "typing_preview"; payload: { conversationId: string; text: string } }
  | { type: "read_receipt"; payload: { conversationId: string; readAt: string } }
  | { type: "control"; payload: ControlPayload }
  | { type: "tag_update"; payload: { conversationId: string; tags: unknown[] } }
  | { type: "category_update"; payload: { conversationId: string; categories: string[] } }
  | { type: "notification"; payload: NotificationPayload }
  | { type: "error"; payload: { code: string; message: string } }
  | { type: "ack"; payload: { ref: string } };

interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  conversationId?: string;
  createdAt: string;
}

interface MediaMeta {
  url: string;
  mimeType: string;
  fileName: string;
}

type ClientEvent =
  | { type: "auth"; token: string; role: ClientRole; ref?: string }
  | { type: "join"; conversationId: string; ref?: string }
  | { type: "leave"; conversationId: string; ref?: string }
  | { type: "send_message"; conversationId: string; content: string; mediaId?: string; isPrivate?: boolean; ref?: string }
  | { type: "typing"; conversationId: string; isTyping: boolean }
  | { type: "typing_preview"; conversationId: string; text: string }
  | { type: "mark_read"; conversationId: string }
  | { type: "control"; conversationId: string; action: "pause_ai" | "resume_ai" | "takeover" | "release" | "resolve" | "escalate" };

interface MessagePayload {
  id: string;
  conversationId: string;
  senderType: "USER" | "AI" | "AGENT";
  senderId?: string;
  content: string;
  createdAt: string;
  senderName?: string;
  media?: MediaMeta;
  isPrivate?: boolean;
}

interface AiChunkPayload {
  conversationId: string;
  messageId: string;
  chunk: string;
}

interface TypingPayload {
  conversationId: string;
  senderId: string;
  senderType: ClientRole;
  isTyping: boolean;
}

interface ControlPayload {
  conversationId: string;
  action: string;
  agentId?: string;
}

// ─── State ───────────────────────────────────────────────────────────────────

const clients = new Map<WebSocket, AuthenticatedClient>();
// conversationId → Set of WebSocket clients
const rooms = new Map<string, Set<WebSocket>>();
// agentId → Set of WebSocket connections (personal notification room)
const agentRooms = new Map<string, Set<WebSocket>>();
// agentId → last activity timestamp (ms)
const agentLastActivity = new Map<string, number>();

function touchAgent(agentId: string) {
  agentLastActivity.set(agentId, Date.now());
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function broadcast(conversationId: string, event: ServerEvent, exclude?: WebSocket) {
  const room = rooms.get(conversationId);
  if (!room) return;

  const data = JSON.stringify(event);
  for (const ws of room) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

// Only deliver to agent connections in a room (for private messages)
function broadcastAgentsOnly(conversationId: string, event: ServerEvent) {
  const room = rooms.get(conversationId);
  if (!room) return;

  const data = JSON.stringify(event);
  for (const ws of room) {
    const c = clients.get(ws);
    if (c?.role === "agent" && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function sendToClient(ws: WebSocket, event: ServerEvent) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function joinRoom(ws: WebSocket, conversationId: string) {
  if (!rooms.has(conversationId)) {
    rooms.set(conversationId, new Set());
  }
  rooms.get(conversationId)!.add(ws);

  const client = clients.get(ws);
  if (client) client.rooms.add(conversationId);
}

function leaveRoom(ws: WebSocket, conversationId: string) {
  rooms.get(conversationId)?.delete(ws);
  clients.get(ws)?.rooms.delete(conversationId);

  // Clean up empty rooms
  if (rooms.get(conversationId)?.size === 0) {
    rooms.delete(conversationId);
  }
}

function leaveAllRooms(ws: WebSocket) {
  const client = clients.get(ws);
  if (!client) return;
  for (const room of client.rooms) {
    leaveRoom(ws, room);
  }
}

function joinAgentRoom(ws: WebSocket, agentId: string) {
  if (!agentRooms.has(agentId)) agentRooms.set(agentId, new Set());
  agentRooms.get(agentId)!.add(ws);
}

function leaveAgentRoom(ws: WebSocket, agentId: string) {
  const room = agentRooms.get(agentId);
  if (!room) return;
  room.delete(ws);
  if (room.size === 0) agentRooms.delete(agentId);
}

function broadcastToAgent(agentId: string, event: ServerEvent) {
  const room = agentRooms.get(agentId);
  if (!room) return;
  const data = JSON.stringify(event);
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

// ─── Wait Message (when AI is disabled workspace-wide) ────────────────────────

const WAIT_MESSAGES = [
  "Got your message. Someone from the team will be with you shortly.",
  "Thanks for reaching out. Connecting you with a team member now.",
  "Hang tight, we are getting someone to help you right away.",
  "Your message is received. A team member will pick this up soon.",
  "We hear you. Someone will be with you in just a moment.",
  "Thanks for your patience. The team will be right with you.",
  "On it. A team member is being connected to your conversation.",
  "We got your message and someone will follow up with you shortly.",
  "Hold tight, the team has been notified and will respond soon.",
  "Message received. We are getting the right person to help you.",
  "Thanks for writing in. A team member will be with you shortly.",
  "Someone from our support team will join this chat very soon.",
];

let lastWaitIndex = -1;

function pickWaitMessage(): string {
  let idx;
  do { idx = Math.floor(Math.random() * WAIT_MESSAGES.length); }
  while (idx === lastWaitIndex && WAIT_MESSAGES.length > 1);
  lastWaitIndex = idx;
  return WAIT_MESSAGES[idx];
}

async function handleWaitMessage(conversationId: string) {
  try {
    const numId = parseInt(conversationId);
    const content = pickWaitMessage();
    const msg = await prisma.message.create({
      data: { conversationId: numId, senderType: "AI", content, isStreaming: false },
    });
    await prisma.conversation.update({
      where: { id: numId },
      data: { lastMessageAt: new Date() },
    });
    broadcast(conversationId, {
      type: "message",
      payload: {
        id: msg.id,
        conversationId,
        senderType: "AI",
        content,
        createdAt: msg.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[ws] wait message error:", err);
  }
}

// ─── AI Response Handler ──────────────────────────────────────────────────────

async function handleAiResponse(conversationId: string) {
  const t = perf(`WS handleAiResponse(${conversationId})`);
  try {
    const numId = parseInt(conversationId);
    const conversation = await prisma.conversation.findUnique({
      where: { id: numId },
      include: {
        user: true,
        messages: {
          where: { isStreaming: false },
          orderBy: { createdAt: "desc" },
          take: 20, // last 20 messages — reversed below so order is asc for AI
        },
      },
    });
    t.split("db fetch");

    if (!conversation || conversation.isAiPaused) return;

    const contextMessages = conversation.messages
      .reverse() // desc → asc so chronological order is preserved for the AI
      .map((m) => ({
        role: m.senderType === "USER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));

    const context: ConversationContext = {
      conversationId,
      categories: conversation.categories,
      userProfile: {
        name: conversation.user.name ?? undefined,
        email: conversation.user.email ?? undefined,
      },
      messages: contextMessages,
    };

    // Create a streaming message record
    const aiMessage = await prisma.message.create({
      data: {
        conversationId: numId,
        senderType: "AI",
        content: "",
        isStreaming: true,
      },
    });

    // Notify room that AI is starting to stream
    broadcast(conversationId, {
      type: "ai_chunk",
      payload: { conversationId, messageId: aiMessage.id, chunk: "" },
    });

    let fullContent = "";
    const ai = getAIProvider();

    // Extract the last user message for guardrail checking
    const lastUserMsg = [...contextMessages].reverse().find((m) => m.role === "user")?.content ?? "";

    for await (const chunk of ai.generateResponse(context)) {
      fullContent += chunk;
      broadcast(conversationId, {
        type: "ai_chunk",
        payload: { conversationId, messageId: aiMessage.id, chunk },
      });
    }

    // Finalize message in DB
    await prisma.message.update({
      where: { id: aiMessage.id },
      data: { content: fullContent, isStreaming: false },
    });

    await prisma.conversation.update({
      where: { id: numId },
      data: { lastMessageAt: new Date() },
    });

    t.split("ai stream complete");

    // Notify stream done — user sees the response immediately
    broadcast(conversationId, {
      type: "ai_done",
      payload: { conversationId, messageId: aiMessage.id },
    });

    // Run guardrail check in parallel (non-blocking for the user)
    checkResponse(lastUserMsg, fullContent)
      .then(async (result) => {
        if (!result.safe) {
          console.warn(`[guardrails] UNSAFE response blocked for conversation ${conversationId}: ${result.reason}`);
          // Replace the message content in DB with safe fallback
          await prisma.message.update({
            where: { id: aiMessage.id },
            data: { content: SAFE_FALLBACK },
          });
          // Notify all clients to replace the message content
          broadcast(conversationId, {
            type: "ai_correction",
            payload: { conversationId, messageId: aiMessage.id, content: SAFE_FALLBACK },
          });
        }
      })
      .catch((err) => {
        console.error("[guardrails] check error:", err);
      });

    t.end();
    // Auto-tag in background
    classifyAndTag(conversationId, [...contextMessages, { role: "assistant", content: fullContent }]);
  } catch (err) {
    console.error("[ws] AI response error:", err);
  }
}

async function classifyAndTag(
  conversationId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
) {
  const t = perf(`WS classifyAndTag(${conversationId})`);
  try {
    const numId = parseInt(conversationId);
    const conversation = await prisma.conversation.findUnique({
      where: { id: numId },
      include: { user: true },
    });
    if (!conversation) return;

    const ai = getAIProvider();
    const tags = await ai.classifyConversation({
      conversationId,
      categories: conversation.categories,
      messages,
    });

    // Batch all tag upserts in a single transaction instead of sequential round-trips
    await prisma.$transaction(
      tags.map((tag) => {
        const tagName = typeof tag.value === "string" ? tag.value : String(tag.value);
        return prisma.tagDefinition.upsert({
          where: { name: tagName },
          create: { name: tagName },
          update: {},
        });
      })
    );

    // Now upsert conversation tags (definitions are guaranteed to exist)
    const defRecords = await prisma.tagDefinition.findMany({
      where: { name: { in: tags.map((t) => typeof t.value === "string" ? t.value : String(t.value)) } },
    });

    await prisma.$transaction(
      defRecords.map((def) =>
        prisma.tag.upsert({
          where: { conversationId_definitionId_source: { conversationId: numId, definitionId: def.id, source: "AI" } },
          create: { conversationId: numId, definitionId: def.id, source: "AI" },
          update: {},
        })
      )
    );

    const updatedTags = await prisma.tag.findMany({
      where: { conversationId: numId },
      include: { definition: true },
    });

    broadcast(conversationId, {
      type: "tag_update",
      payload: { conversationId, tags: updatedTags },
    });
    t.end();
  } catch (err) {
    console.error("[ws] Classification error:", err);
  }
}

// ─── Auto Category Updater ───────────────────────────────────────────────────

async function autoUpdateCategory(conversationId: string, messageText: string, currentCategories: string[]) {
  try {
    const numId = parseInt(conversationId);
    const guess = guessCategory(messageText);
    if (!guess) return;
    // Only add if not already in the list and confidence is high
    if (currentCategories.includes(guess.category) || guess.confidence < 0.75) return;

    const updated = await prisma.conversation.update({
      where: { id: numId },
      data: { categories: { push: guess.category as "CARDS" | "ACCOUNT" | "SPENDS" | "KYC" | "GENERAL" | "OTHER" } },
      select: { categories: true },
    });

    broadcast(conversationId, {
      type: "category_update",
      payload: { conversationId, categories: updated.categories },
    });
  } catch (err) {
    console.error("[ws] Auto category error:", err);
  }
}

// ─── Message Handler ──────────────────────────────────────────────────────────

async function handleClientMessage(ws: WebSocket, raw: string) {
  let event: ClientEvent;

  try {
    event = JSON.parse(raw);
  } catch {
    sendToClient(ws, {
      type: "error",
      payload: { code: "PARSE_ERROR", message: "Invalid JSON" },
    });
    return;
  }

  // Normalize conversationId to string — clients may send number or string
  if (event.conversationId !== undefined) {
    event.conversationId = String(event.conversationId);
  }

  const client = clients.get(ws);

  // Update last-activity timestamp for any agent message
  if (client?.role === "agent" && client.agentId) {
    touchAgent(client.agentId);
  }

  switch (event.type) {
    case "auth": {
      try {
        if (event.role === "agent") {
          const payload = await verifyAccessToken(event.token);
          clients.set(ws, {
            ws,
            role: "agent",
            agentId: payload.agentId,
            rooms: new Set(),
          });
          joinAgentRoom(ws, payload.agentId);
          touchAgent(payload.agentId);
        } else {
          // User auth: verify the signed chat JWT from the app backend
          const chatSecretVal = process.env.CHAT_TOKEN_SECRET;
          if (!chatSecretVal) {
            sendToClient(ws, { type: "error", payload: { message: "Unauthorized" } });
            ws.close();
            return;
          }
          const chatSecret = new TextEncoder().encode(chatSecretVal);
          let userId: string;
          try {
            const { payload } = await jwtVerify(event.token, chatSecret);
            if (typeof payload.sub !== "string" || !payload.sub) throw new Error("invalid sub");
            userId = payload.sub;
          } catch {
            sendToClient(ws, { type: "error", payload: { message: "Unauthorized" } });
            ws.close();
            return;
          }
          clients.set(ws, {
            ws,
            role: "user",
            userId,
            rooms: new Set(),
          });
        }
        if (event.ref) {
          sendToClient(ws, { type: "ack", payload: { ref: event.ref } });
        }
      } catch {
        sendToClient(ws, {
          type: "error",
          payload: { code: "AUTH_FAILED", message: "Invalid token" },
        });
        ws.close(4001, "Unauthorized");
      }
      break;
    }

    case "join": {
      if (!client) {
        sendToClient(ws, {
          type: "error",
          payload: { code: "NOT_AUTHENTICATED", message: "Authenticate first" },
        });
        return;
      }
      // Users can only join rooms for their own conversations
      if (client.role === "user") {
        const conv = await prisma.conversation.findUnique({
          where: { id: parseInt(event.conversationId) },
          select: { user: { select: { externalId: true } } },
        });
        if (!conv || conv.user.externalId !== client.userId) {
          sendToClient(ws, { type: "error", payload: { code: "FORBIDDEN", message: "Not found" } });
          return;
        }
      }
      joinRoom(ws, event.conversationId);
      if (event.ref) {
        sendToClient(ws, { type: "ack", payload: { ref: event.ref } });
      }
      break;
    }

    case "leave": {
      leaveRoom(ws, event.conversationId);
      if (event.ref) {
        sendToClient(ws, { type: "ack", payload: { ref: event.ref } });
      }
      break;
    }

    case "send_message": {
      if (!client) return;

      const { conversationId, content, mediaId, isPrivate } = event;
      const convNumId = parseInt(conversationId);
      const tMsg = perf(`WS send_message(${conversationId})`);

      // Parallelize all independent reads upfront
      const [conversation, agentRecord, mediaRecord] = await Promise.all([
        prisma.conversation.findUnique({
          where: { id: convNumId },
          include: { user: true },
        }),
        client.role === "agent" && client.agentId
          ? prisma.agent.findUnique({ where: { id: client.agentId }, select: { name: true } })
          : null,
        mediaId
          ? prisma.media.findUnique({ where: { id: mediaId } })
          : null,
      ]);
      if (!conversation) return;

      // Users can only send messages to their own conversations
      if (client.role === "user" && conversation.user.externalId !== client.userId) return;

      let senderType: "USER" | "AGENT" = "USER";
      let senderId: string | undefined;
      let senderName: string | undefined;

      if (client.role === "agent" && client.agentId) {
        senderType = "AGENT";
        senderId = client.agentId;
        senderName = agentRecord?.name;
      } else {
        senderName = conversation.user.name ?? "User";
      }

      const message = await prisma.message.create({
        data: {
          conversationId: convNumId,
          senderType,
          senderId: senderId ?? null,
          content,
          isPrivate: isPrivate === true && senderType === "AGENT",
          ...(mediaRecord ? { mediaId: mediaRecord.id } : {}),
        },
      });

      await prisma.conversation.update({
        where: { id: convNumId },
        data: {
          lastMessageAt: new Date(),
          ...(senderType === "AGENT" && senderId
            ? { assignedAgentId: senderId, isAiPaused: true }
            : {}),
          // Reopen conversation when user replies to a non-open chat
          ...(senderType === "USER" && conversation.status !== "OPEN"
            ? { status: "OPEN" }
            : {}),
        },
      });

      const msgPayload: MessagePayload = {
        id: message.id,
        conversationId,
        senderType,
        senderId,
        content,
        createdAt: message.createdAt.toISOString(),
        senderName,
        media: mediaRecord ?? undefined,
        isPrivate: message.isPrivate,
      };

      // Private messages: only agents can see them
      if (message.isPrivate) {
        broadcastAgentsOnly(conversationId, { type: "message", payload: msgPayload });
      } else {
        broadcast(conversationId, { type: "message", payload: msgPayload });
      }

      // Reopen conversation for agents viewing it
      if (senderType === "USER" && conversation.status !== "OPEN") {
        broadcast(conversationId, {
          type: "control",
          payload: { conversationId, action: "reopen" },
        });
      }

      // Auto-detect category from user message (fire-and-forget)
      if (senderType === "USER") {
        autoUpdateCategory(conversationId, content, conversation.categories);
      }

      // Notify agents of new user message (skip private agent messages)
      if (senderType === "USER" && !message.isPrivate) {
        // All online active agents get notified of every chat
        const onlineAgents = await prisma.agent.findMany({
          where: { isActive: true, status: "ONLINE" },
          select: { id: true },
        });
        const notifyIds = onlineAgents.map((a) => a.id);
        const notifTitle = `New message from ${conversation.user.name ?? conversation.user.externalId}`;
        const notifBody = content.slice(0, 100);
        createNotifications({
          agentIds: notifyIds,
          type: "NEW_MESSAGE",
          title: notifTitle,
          body: notifBody,
          conversationId: convNumId,
        }).then((ids) => {
          notifyIds.forEach((agentId, i) => {
            broadcastToAgent(agentId, {
              type: "notification",
              payload: { id: ids[i] ?? "", type: "NEW_MESSAGE", title: notifTitle, body: notifBody, conversationId, createdAt: new Date().toISOString() },
            });
          });
        }).catch((e) => console.error("[ws] notify error:", e));
      }

      // Trigger AI response if not paused and message is from user
      if (senderType === "USER" && !conversation.isAiPaused) {
        if (conversation.queuedAt) return;

        // Parallelize: fetch settings (cached) + count prior user messages at once
        const [ws_setting, priorUserMsgs] = await Promise.all([
          getWorkspaceSetting(),
          prisma.message.count({
            where: { conversationId: convNumId, senderType: "USER", NOT: { id: message.id } },
          }),
        ]);
        const aiEnabled = ws_setting.aiEnabled;

        if (priorUserMsgs === 0) {
          // Single query to check capacity across all agents instead of N separate counts
          const capacityResult = await prisma.$queryRaw<{ has_capacity: boolean }[]>`
            SELECT EXISTS (
              SELECT 1 FROM "Agent" a
              WHERE a."isActive" = true AND a."status" = 'ONLINE'
                AND (SELECT COUNT(*) FROM "Conversation" c WHERE c."assignedAgentId" = a."id" AND c."status" = 'OPEN') < a."maxConcurrentChats"
            ) as has_capacity
          `;
          const hasCapacity = capacityResult[0]?.has_capacity ?? false;

          if (!hasCapacity) {
            const queueMsg =
              ws_setting.queueMessage?.trim() ||
              "All our agents are currently busy. You have been added to the queue and someone will be with you as soon as possible.";
            // Combine queue update + last message time into one update, and create message in parallel
            const [qMsg] = await Promise.all([
              prisma.message.create({
                data: { conversationId: convNumId, senderType: "AI", content: queueMsg, isStreaming: false },
              }),
              prisma.conversation.update({
                where: { id: convNumId },
                data: { queuedAt: new Date(), lastMessageAt: new Date() },
              }),
            ]);
            broadcast(conversationId, {
              type: "message",
              payload: { id: qMsg.id, conversationId, senderType: "AI", content: queueMsg, createdAt: qMsg.createdAt.toISOString() },
            });
            return;
          }
        }

        if (aiEnabled) {
          handleAiResponse(conversationId);
        } else {
          handleWaitMessage(conversationId);
        }
      }

      tMsg.end();
      if (event.ref) {
        sendToClient(ws, { type: "ack", payload: { ref: event.ref } });
      }
      break;
    }

    case "typing": {
      if (!client) return;
      broadcast(
        event.conversationId,
        {
          type: "typing",
          payload: {
            conversationId: event.conversationId,
            senderId: client.agentId ?? client.userId ?? "unknown",
            senderType: client.role,
            isTyping: event.isTyping,
          },
        },
        ws
      );
      break;
    }

    case "typing_preview": {
      // Only users send typing previews; forward only to agents in the room
      if (!client || client.role !== "user") return;
      broadcastAgentsOnly(event.conversationId, {
        type: "typing_preview",
        payload: { conversationId: event.conversationId, text: event.text },
      });
      break;
    }

    case "mark_read": {
      // Only users send read receipts
      if (!client || client.role !== "user") return;
      // Verify the user owns this conversation before marking it read
      const convOwner = await prisma.conversation.findUnique({
        where: { id: parseInt(event.conversationId) },
        select: { user: { select: { externalId: true } } },
      });
      if (!convOwner || convOwner.user.externalId !== client.userId) return;
      const readAt = new Date();
      await prisma.conversation.update({
        where: { id: parseInt(event.conversationId) },
        data: { lastReadByUserAt: readAt },
      }).catch(() => {});
      broadcastAgentsOnly(event.conversationId, {
        type: "read_receipt",
        payload: { conversationId: event.conversationId, readAt: readAt.toISOString() },
      });
      break;
    }

    case "control": {
      if (!client || client.role !== "agent") {
        sendToClient(ws, {
          type: "error",
          payload: { code: "FORBIDDEN", message: "Only agents can send control events" },
        });
        return;
      }

      const { conversationId, action } = event;
      const ctrlNumId = parseInt(conversationId);

      switch (action) {
        case "pause_ai":
          await prisma.conversation.update({
            where: { id: ctrlNumId },
            data: { isAiPaused: true },
          });
          break;
        case "resume_ai":
          await prisma.conversation.update({
            where: { id: ctrlNumId },
            data: { isAiPaused: false },
          });
          break;
        case "takeover":
          await prisma.conversation.update({
            where: { id: ctrlNumId },
            data: {
              isAiPaused: true,
              assignedAgentId: client.agentId,
              status: "OPEN",
            },
          });
          break;
        case "release":
          await prisma.conversation.update({
            where: { id: ctrlNumId },
            data: {
              isAiPaused: false,
              assignedAgentId: null,
            },
          });
          break;
        case "resolve":
          await prisma.conversation.update({
            where: { id: ctrlNumId },
            data: { status: "RESOLVED", isAiPaused: true },
          });
          break;
        case "escalate": {
          const escalatedConv = await prisma.conversation.update({
            where: { id: ctrlNumId },
            data: { status: "ESCALATED", isAiPaused: true },
            include: { user: true },
          });
          const adminAgents = await prisma.agent.findMany({ where: { isActive: true, status: "ONLINE" }, select: { id: true } });
          const adminIds = adminAgents.map((a) => a.id);
          const escTitle = "Conversation Escalated";
          const escBody = `A conversation${escalatedConv.user.name ? ` from ${escalatedConv.user.name}` : ""} has been escalated and needs attention.`;
          createNotifications({ agentIds: adminIds, type: "ESCALATED", title: escTitle, body: escBody, conversationId: ctrlNumId })
            .then((ids) => {
              adminIds.forEach((agentId, i) => {
                broadcastToAgent(agentId, {
                  type: "notification",
                  payload: { id: ids[i] ?? "", type: "ESCALATED", title: escTitle, body: escBody, conversationId, createdAt: new Date().toISOString() },
                });
              });
            })
            .catch((e) => console.error("[ws] escalate notify error:", e));
          break;
        }
      }

      broadcast(conversationId, {
        type: "control",
        payload: { conversationId, action, agentId: client.agentId },
      });
      break;
    }
  }
}

// ─── Server Setup ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.WS_PORT ?? "3001", 10);
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_APP_URL;
const INTERNAL_KEY = process.env.WS_INTERNAL_KEY ?? "";

// HTTP server — handles both WS upgrades and internal API calls from Next.js
const httpServer = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/internal/notify") {
    // Validate internal key if configured
    if (INTERNAL_KEY && req.headers["x-internal-key"] !== INTERNAL_KEY) {
      res.writeHead(401);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { agentId, notification } = JSON.parse(body);
        broadcastToAgent(agentId, { type: "notification", payload: notification });
        res.writeHead(200);
        res.end("ok");
      } catch {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: (info: { origin: string; req: IncomingMessage }) => {
    if (!ALLOWED_ORIGIN) return true; // dev: allow all
    return info.origin === ALLOWED_ORIGIN;
  },
});

httpServer.listen(PORT, () => {});

// Per-connection message queues — ensures auth always fully completes before join/send_message
const messageQueues = new Map<WebSocket, Promise<void>>();

wss.on("connection", (ws: WebSocket) => {
  // Initialize unauthenticated client entry
  clients.set(ws, { ws, role: "user", rooms: new Set() });
  messageQueues.set(ws, Promise.resolve());

  ws.on("message", (data: Buffer) => {
    // Chain each message handler so they run sequentially per connection.
    // This prevents auth from racing with join/send_message on connect.
    const prev = messageQueues.get(ws) ?? Promise.resolve();
    const next = prev.then(() => handleClientMessage(ws, data.toString()));
    messageQueues.set(ws, next);
    next.catch(() => {});
  });

  ws.on("close", () => {
    messageQueues.delete(ws);
    const client = clients.get(ws);
    if (client?.role === "agent" && client.agentId) {
      leaveAgentRoom(ws, client.agentId);
    }
    leaveAllRooms(ws);
    clients.delete(ws);
  });

  ws.on("error", (err) => {
    console.error("[ws] Client error:", err.message);
  });
});

// Queue timeout checker — promote stale queued conversations to tickets
const DEFAULT_TICKET_MESSAGE =
  "Sorry, all our agents are busy at the moment. Your ticket has been created with the number #{ticketId}. We'll get back to you as soon as possible.";

setInterval(async () => {
  try {
    const setting = await getWorkspaceSetting();
    const timeoutMinutes = setting.queueTimeoutMinutes;
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const timedOutConvs = await prisma.conversation.findMany({
      where: { queuedAt: { not: null, lt: cutoff }, status: "OPEN" },
      include: { user: true },
    });

    if (timedOutConvs.length === 0) return;

    // Find a system agent (admin preferred) to attach as ticket creator
    const systemAgent = await prisma.agent.findFirst({
      where: { isActive: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (!systemAgent) return;

    for (const conv of timedOutConvs) {
      const ticket = await prisma.ticket.create({
        data: {
          title: `Support request from ${conv.user.name ?? conv.user.externalId}`,
          description: `Auto-created after queue timeout for conversation ${conv.id}`,
          status: "OPEN",
          priority: "MEDIUM",
          createdById: systemAgent.id,
        },
      });

      await prisma.conversation.update({
        where: { id: conv.id },
        data: { queuedAt: null, ticketId: ticket.id },
      });

      const rawMsg = setting.ticketMessage?.trim() || DEFAULT_TICKET_MESSAGE;
      const ticketMsg = rawMsg.replace("{ticketId}", String(conv.id));

      const msg = await prisma.message.create({
        data: { conversationId: conv.id, senderType: "AI", content: ticketMsg, isStreaming: false },
      });
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { lastMessageAt: new Date() },
      });

      const convIdStr = String(conv.id);
      broadcast(convIdStr, {
        type: "message",
        payload: {
          id: msg.id,
          conversationId: convIdStr,
          senderType: "AI",
          content: ticketMsg,
          createdAt: msg.createdAt.toISOString(),
        },
      });
    }
  } catch (err) {
    console.error("[ws] Queue timeout check error:", err);
  }
}, 60_000);

// Heartbeat — ping all clients every 30s
setInterval(() => {
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      leaveAllRooms(ws);
      clients.delete(ws);
    }
  }
}, 30_000);

// Agent inactivity checker — set ONLINE/AWAY agents to OFFLINE after configurable inactivity
setInterval(async () => {
  try {
    const setting = await getWorkspaceSetting();
    if (!setting.agentInactivityEnabled) return;

    const thresholdMs = setting.agentInactivityHours * 60 * 60 * 1000;
    const now = Date.now();
    const activeAgents = await prisma.agent.findMany({
      where: { status: { in: ["ONLINE", "AWAY"] } },
      select: { id: true },
    });

    const toSetOffline = activeAgents.filter(({ id }) => {
      const lastSeen = agentLastActivity.get(id);
      return !lastSeen || now - lastSeen > thresholdMs;
    });

    if (toSetOffline.length > 0) {
      const ids = toSetOffline.map((a) => a.id);
      await prisma.agent.updateMany({
        where: { id: { in: ids } },
        data: { status: "OFFLINE" },
      });
    }
  } catch (err) {
    console.error("[ws] Inactivity check error:", err);
  }
}, 15 * 60 * 1000); // run every 15 minutes

export {};
