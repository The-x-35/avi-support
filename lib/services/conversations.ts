import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import type { ConversationStatus, Category, Priority } from "@prisma/client";
import { perf } from "@/lib/perf";

export interface ConversationFilters {
  status?: ConversationStatus | ConversationStatus[];
  category?: Category | Category[];
  priority?: Priority | Priority[];
  isAiPaused?: boolean;
  assignedAgentId?: string | null;
  userId?: string;
  search?: string;
  tagName?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
  skipCount?: boolean;
}

// Raw row types for $queryRaw results
interface TagRow {
  id: string;
  conversationId: number;
  definitionId: string;
  createdAt: Date;
  td_id: string;
  td_name: string;
  td_color: string | null;
}

interface LatestMsgRow {
  conversationId: number;
  content: string;
  senderType: string;
  createdAt: Date;
}

interface MsgWithRelationsRow {
  id: string;
  conversationId: number;
  senderType: string;
  senderId: string | null;
  content: string;
  isStreaming: boolean;
  isPrivate: boolean;
  mediaId: string | null;
  createdAt: Date;
  a_id: string | null;
  a_name: string | null;
  a_avatarUrl: string | null;
  med_id: string | null;
  med_url: string | null;
  med_mimeType: string | null;
  med_fileName: string | null;
}

export async function getConversations(filters: ConversationFilters = {}) {
  const {
    status,
    category,
    priority,
    isAiPaused,
    assignedAgentId,
    userId,
    search,
    tagName,
    dateFrom,
    dateTo,
    page = 1,
    limit = 50,
    skipCount = false,
  } = filters;

  const where: Prisma.ConversationWhereInput = { lastMessageAt: { not: null } };

  if (status) {
    where.status = Array.isArray(status) ? { in: status } : status;
  }
  if (category) {
    where.categories = { hasSome: Array.isArray(category) ? category : [category] };
  }
  if (priority) {
    where.priority = Array.isArray(priority) ? { in: priority } : priority;
  }
  if (typeof isAiPaused === "boolean") {
    where.isAiPaused = isAiPaused;
  }
  if (assignedAgentId !== undefined) {
    where.assignedAgentId = assignedAgentId;
  }
  if (userId) {
    where.userId = userId;
  }
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  if (tagName) {
    where.tags = { some: { definition: { name: tagName } } };
  }

  if (search) {
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { user: { externalId: { contains: search, mode: "insensitive" } } },
    ];
  }

  const t = perf("getConversations");

  // Round 1: fetch conversation scalars + (optionally) count in parallel
  const [convRows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      select: {
        id: true, userId: true, categories: true, status: true,
        isAiPaused: true, assignedAgentId: true, priority: true,
        subject: true, queuedAt: true, lastMessageAt: true,
        lastReadByUserAt: true, createdAt: true, updatedAt: true, ticketId: true,
      },
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    skipCount ? Promise.resolve(0) : prisma.conversation.count({ where }),
  ]);

  if (!convRows.length) {
    t.end();
    return { conversations: [], total, page, limit };
  }

  const ids = convRows.map((c) => c.id);
  const userIds = [...new Set(convRows.map((c) => c.userId))];
  const agentIds = [
    ...new Set(convRows.map((c) => c.assignedAgentId).filter((id): id is string => id !== null)),
  ];

  // Round 2: fetch all relations in parallel (1 round instead of 2)
  const [users, agents, tagRows, latestMsgs] = await Promise.all([
    prisma.endUser.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, avatarUrl: true, externalId: true },
    }),
    agentIds.length
      ? prisma.agent.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true, avatarUrl: true },
        })
      : Promise.resolve([]),
    // JOIN tag + tagDefinition in one query — avoids a 3rd sequential round
    prisma.$queryRaw<TagRow[]>`
      SELECT t.id, t."conversationId", t."definitionId", t."createdAt",
             td.id AS "td_id", td.name AS "td_name", td.color AS "td_color"
      FROM "Tag" t
      JOIN "TagDefinition" td ON td.id = t."definitionId"
      WHERE t."conversationId" IN (${Prisma.join(ids)})
    `,
    // DISTINCT ON to get latest non-empty message per conversation
    prisma.$queryRaw<LatestMsgRow[]>`
      SELECT DISTINCT ON ("conversationId")
             "conversationId", content, "senderType", "createdAt"
      FROM "Message"
      WHERE "conversationId" IN (${Prisma.join(ids)})
        AND content <> ''
      ORDER BY "conversationId", "createdAt" DESC
    `,
  ]);

  // Build lookup maps
  const userMap = new Map(users.map((u) => [u.id, u]));
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const tagsMap = new Map<number, TagRow[]>();
  for (const row of tagRows) {
    const key = Number(row.conversationId);
    if (!tagsMap.has(key)) tagsMap.set(key, []);
    tagsMap.get(key)!.push(row);
  }

  const msgMap = new Map(latestMsgs.map((m) => [Number(m.conversationId), m]));

  // Assemble final shape
  const conversations = convRows.map((c) => ({
    ...c,
    user: userMap.get(c.userId) ?? { id: c.userId, name: null, email: null, avatarUrl: null, externalId: "" },
    assignedAgent: c.assignedAgentId ? (agentMap.get(c.assignedAgentId) ?? null) : null,
    tags: (tagsMap.get(c.id) ?? []).map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      definitionId: row.definitionId,
      createdAt: row.createdAt,
      definition: { id: row.td_id, name: row.td_name, color: row.td_color },
    })),
    messages: (() => {
      const m = msgMap.get(c.id);
      return m ? [{ content: m.content, senderType: m.senderType, createdAt: m.createdAt }] : [];
    })(),
  }));

  t.end();
  return { conversations, total, page, limit };
}

export async function getConversationById(id: number) {
  const t = perf(`getConversationById(${id})`);

  // Fetch conversation scalars (stale streaming cleanup moved to background — see cleanupStaleStreaming)
  const conv = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true, userId: true, categories: true, status: true,
      isAiPaused: true, assignedAgentId: true, priority: true,
      subject: true, queuedAt: true, lastMessageAt: true,
      lastReadByUserAt: true, createdAt: true, updatedAt: true, ticketId: true,
    },
  });

  if (!conv) {
    t.end();
    return null;
  }

  // Single round: fetch all relations in parallel using independent promises
  // Each query uses its own connection from the pool to avoid serialization
  const userP = prisma.endUser.findUnique({
    where: { id: conv.userId },
    select: { id: true, name: true, email: true, phone: true, avatarUrl: true, externalId: true, createdAt: true },
  });
  const agentP = conv.assignedAgentId
    ? prisma.agent.findUnique({
        where: { id: conv.assignedAgentId },
        select: { id: true, name: true, avatarUrl: true, email: true },
      })
    : Promise.resolve(null);
  const ticketP = conv.ticketId
    ? prisma.ticket.findUnique({ where: { id: conv.ticketId } })
    : Promise.resolve(null);
  const tagsP = prisma.$queryRaw<TagRow[]>`
    SELECT t.id, t."conversationId", t."definitionId", t."createdAt",
           td.id AS "td_id", td.name AS "td_name", td.color AS "td_color"
    FROM "Tag" t
    JOIN "TagDefinition" td ON td.id = t."definitionId"
    WHERE t."conversationId" = ${id}
  `;
  // Fetch last 200 messages (covers virtually all conversations; prevents huge payloads)
  const msgsP = prisma.$queryRaw<MsgWithRelationsRow[]>`
    SELECT * FROM (
      SELECT m.id, m."conversationId", m."senderType", m."senderId",
             m.content, m."isStreaming", m."isPrivate", m."mediaId", m."createdAt",
             a.id AS "a_id", a.name AS "a_name", a."avatarUrl" AS "a_avatarUrl",
             med.id AS "med_id", med.url AS "med_url",
             med."mimeType" AS "med_mimeType", med."fileName" AS "med_fileName"
      FROM "Message" m
      LEFT JOIN "Agent" a ON a.id = m."senderId" AND m."senderType" = 'AGENT'
      LEFT JOIN "Media" med ON med.id = m."mediaId"
      WHERE m."conversationId" = ${id}
      ORDER BY m."createdAt" DESC
      LIMIT 200
    ) sub ORDER BY sub."createdAt" ASC
  `;

  const [user, assignedAgent, ticket, tagRows, msgRows] = await Promise.all([
    userP, agentP, ticketP, tagsP, msgsP,
  ]);

  const tags = tagRows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    definitionId: row.definitionId,
    createdAt: row.createdAt,
    definition: { id: row.td_id, name: row.td_name, color: row.td_color },
  }));

  const messages = msgRows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    senderType: row.senderType,
    senderId: row.senderId,
    content: row.content,
    isStreaming: row.isStreaming,
    isPrivate: row.isPrivate,
    mediaId: row.mediaId,
    createdAt: row.createdAt,
    agent: row.a_id ? { id: row.a_id, name: row.a_name!, avatarUrl: row.a_avatarUrl } : null,
    media: row.med_id
      ? { id: row.med_id, url: row.med_url!, mimeType: row.med_mimeType!, fileName: row.med_fileName! }
      : null,
  }));

  t.end();
  return { ...conv, user, assignedAgent, ticket, tags, messages };
}

export async function updateConversationControl(
  id: number,
  action: "pause_ai" | "resume_ai" | "takeover" | "resolve" | "escalate",
  agentId?: string
) {
  switch (action) {
    case "pause_ai":
      return prisma.conversation.update({
        where: { id },
        data: { isAiPaused: true },
      });
    case "resume_ai":
      return prisma.conversation.update({
        where: { id },
        data: { isAiPaused: false },
      });
    case "takeover":
      return prisma.conversation.update({
        where: { id },
        data: { isAiPaused: true, assignedAgentId: agentId ?? null },
      });
    case "resolve":
      return prisma.conversation.update({
        where: { id },
        data: { status: "RESOLVED" },
      });
    case "escalate":
      return prisma.conversation.update({
        where: { id },
        data: { status: "ESCALATED", priority: "HIGH" },
      });
  }
}

/**
 * Cleanup stale streaming messages — call periodically (e.g. every 60s),
 * NOT on every getConversationById request.
 */
export async function cleanupStaleStreaming() {
  return prisma.message.updateMany({
    where: {
      isStreaming: true,
      createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    data: { isStreaming: false },
  });
}
