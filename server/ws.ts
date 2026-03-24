/**
 * Standalone WebSocket server — runs on WS_PORT (default 3001)
 * Handles real-time chat: messages, AI streaming, typing indicators,
 * pause/resume/takeover controls, and room-based broadcasting.
 *
 * Run with: npx tsx server/ws.ts
 */

import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { verifyAccessToken } from "../lib/auth/jwt";
import { prisma } from "../lib/db/prisma";
import { getAIProvider } from "../lib/ai";
import type { ConversationContext } from "../lib/ai/types";
import { guessCategory } from "../lib/auto-tagger";
import { createNotifications } from "../lib/notifications";

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
  | { type: "typing"; payload: TypingPayload }
  | { type: "typing_preview"; payload: { conversationId: string; text: string } }
  | { type: "read_receipt"; payload: { conversationId: string; readAt: string } }
  | { type: "control"; payload: ControlPayload }
  | { type: "tag_update"; payload: { conversationId: string; tags: unknown[] } }
  | { type: "category_update"; payload: { conversationId: string; category: string } }
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
    const content = pickWaitMessage();
    const msg = await prisma.message.create({
      data: { conversationId, senderType: "AI", content, isStreaming: false },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
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
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        user: true,
        messages: {
          where: { isStreaming: false },
          orderBy: { createdAt: "desc" },
          take: 20, // last 20 messages — reversed below so order is asc for AI
        },
      },
    });

    if (!conversation || conversation.isAiPaused) return;

    const contextMessages = conversation.messages
      .reverse() // desc → asc so chronological order is preserved for the AI
      .map((m) => ({
        role: m.senderType === "USER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));

    const context: ConversationContext = {
      conversationId,
      category: conversation.category,
      userProfile: {
        name: conversation.user.name ?? undefined,
        email: conversation.user.email ?? undefined,
      },
      messages: contextMessages,
    };

    // Create a streaming message record
    const aiMessage = await prisma.message.create({
      data: {
        conversationId,
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

    for await (const chunk of ai.generateResponse(context)) {
      fullContent += chunk;
      broadcast(conversationId, {
        type: "ai_chunk",
        payload: { conversationId, messageId: aiMessage.id, chunk },
      });
    }

    // Finalize message
    await prisma.message.update({
      where: { id: aiMessage.id },
      data: { content: fullContent, isStreaming: false },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    // Notify stream done
    broadcast(conversationId, {
      type: "ai_done",
      payload: { conversationId, messageId: aiMessage.id },
    });

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
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { user: true },
    });
    if (!conversation) return;

    const ai = getAIProvider();
    const tags = await ai.classifyConversation({
      conversationId,
      category: conversation.category,
      messages,
    });

    for (const tag of tags) {
      const def = await prisma.tagDefinition.upsert({
        where: { type_value: { type: tag.type, value: tag.value } },
        create: {
          type: tag.type,
          value: tag.value,
          label: formatTagLabel(tag.value),
          isSystem: true,
        },
        update: {},
      });

      await prisma.tag.upsert({
        where: { conversationId_definitionId: { conversationId, definitionId: def.id } },
        create: {
          conversationId,
          definitionId: def.id,
          confidence: tag.confidence,
          source: "AI",
        },
        update: {
          confidence: tag.confidence,
          updatedAt: new Date(),
        },
      });
    }

    // Broadcast updated tags
    const updatedTags = await prisma.tag.findMany({
      where: { conversationId },
      include: { definition: true },
    });

    broadcast(conversationId, {
      type: "tag_update",
      payload: { conversationId, tags: updatedTags },
    });
  } catch (err) {
    console.error("[ws] Classification error:", err);
  }
}

function formatTagLabel(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Auto Category Updater ───────────────────────────────────────────────────

async function autoUpdateCategory(conversationId: string, messageText: string, currentCategory: string) {
  try {
    const guess = guessCategory(messageText);
    if (!guess) return;
    // Only update if detected category differs and confidence is high
    if (guess.category === currentCategory || guess.confidence < 0.75) return;

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { category: guess.category },
    });

    broadcast(conversationId, {
      type: "category_update",
      payload: { conversationId, category: guess.category },
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

  const client = clients.get(ws);

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
        } else {
          // User auth: token is externalUserId (simplified — production would verify app JWT)
          clients.set(ws, {
            ws,
            role: "user",
            userId: event.token,
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

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { user: true },
      });
      if (!conversation) return;

      let senderType: "USER" | "AGENT" = "USER";
      let senderId: string | undefined;
      let senderName: string | undefined;

      if (client.role === "agent" && client.agentId) {
        senderType = "AGENT";
        senderId = client.agentId;
        const agent = await prisma.agent.findUnique({ where: { id: client.agentId } });
        senderName = agent?.name;
      } else {
        senderName = conversation.user.name ?? "User";
      }

      // Look up media record if provided
      const mediaRecord = mediaId
        ? await prisma.media.findUnique({ where: { id: mediaId } })
        : null;

      const message = await prisma.message.create({
        data: {
          conversationId,
          senderType,
          senderId: senderId ?? null,
          content,
          isPrivate: isPrivate === true && senderType === "AGENT",
          ...(mediaRecord ? { mediaId: mediaRecord.id } : {}),
        },
      });

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
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

      // Auto-detect category from user message (fire-and-forget)
      if (senderType === "USER") {
        autoUpdateCategory(conversationId, content, conversation.category);
      }

      // Notify agents of new user message (skip private agent messages)
      if (senderType === "USER" && !message.isPrivate) {
        const notifyIds = conversation.assignedAgentId
          ? [conversation.assignedAgentId]
          : (await prisma.agent.findMany({ where: { isActive: true }, select: { id: true } })).map((a) => a.id);
        const notifTitle = `New message from ${conversation.user.externalId}`;
        const notifBody = content.slice(0, 100);
        createNotifications({
          agentIds: notifyIds,
          type: "NEW_MESSAGE",
          title: notifTitle,
          body: notifBody,
          conversationId,
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
        const ws_setting = await prisma.workspaceSetting.findUnique({ where: { id: "default" } });
        const aiEnabled = ws_setting?.aiEnabled ?? true;
        if (aiEnabled) {
          handleAiResponse(conversationId);
        } else {
          // AI is disabled — send a "please wait" auto-message
          handleWaitMessage(conversationId);
        }
      }

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
      const readAt = new Date();
      await prisma.conversation.update({
        where: { id: event.conversationId },
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

      switch (action) {
        case "pause_ai":
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { isAiPaused: true },
          });
          break;
        case "resume_ai":
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { isAiPaused: false },
          });
          break;
        case "takeover":
          await prisma.conversation.update({
            where: { id: conversationId },
            data: {
              isAiPaused: true,
              assignedAgentId: client.agentId,
              status: "OPEN",
            },
          });
          break;
        case "release":
          await prisma.conversation.update({
            where: { id: conversationId },
            data: {
              isAiPaused: false,
              assignedAgentId: null,
            },
          });
          break;
        case "resolve":
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { status: "RESOLVED", isAiPaused: true },
          });
          break;
        case "escalate": {
          const escalatedConv = await prisma.conversation.update({
            where: { id: conversationId },
            data: { status: "ESCALATED", isAiPaused: true },
            include: { user: true },
          });
          const adminAgents = await prisma.agent.findMany({ where: { isActive: true }, select: { id: true } });
          const adminIds = adminAgents.map((a) => a.id);
          const escTitle = "Conversation Escalated";
          const escBody = `A conversation${escalatedConv.user.name ? ` from ${escalatedConv.user.name}` : ""} has been escalated and needs attention.`;
          createNotifications({ agentIds: adminIds, type: "ESCALATED", title: escTitle, body: escBody, conversationId })
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

const wss = new WebSocketServer({
  port: PORT,
  verifyClient: (info: { origin: string; req: IncomingMessage }) => {
    if (!ALLOWED_ORIGIN) return true; // dev: allow all
    return info.origin === ALLOWED_ORIGIN;
  },
});

wss.on("listening", () => {
  console.log(`[ws] WebSocket server listening on port ${PORT}`);
});

wss.on("connection", (ws: WebSocket) => {
  // Initialize unauthenticated client entry
  clients.set(ws, { ws, role: "user", rooms: new Set() });

  ws.on("message", (data: Buffer) => {
    handleClientMessage(ws, data.toString());
  });

  ws.on("close", () => {
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

export {};
