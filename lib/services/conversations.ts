import { prisma } from "@/lib/db/prisma";
import type { ConversationStatus, Category, Priority, Prisma } from "@prisma/client";

export interface ConversationFilters {
  status?: ConversationStatus | ConversationStatus[];
  category?: Category | Category[];
  priority?: Priority | Priority[];
  isAiPaused?: boolean;
  assignedAgentId?: string | null;
  userId?: string;
  search?: string;
  tagType?: string;
  tagValue?: string;
  sentiment?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
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
    tagType,
    tagValue,
    dateFrom,
    dateTo,
    page = 1,
    limit = 50,
  } = filters;

  const where: Prisma.ConversationWhereInput = {};

  if (status) {
    where.status = Array.isArray(status) ? { in: status } : status;
  }
  if (category) {
    where.category = Array.isArray(category) ? { in: category } : category;
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

  // Tag filters
  if (tagType && tagValue) {
    where.tags = {
      some: {
        definition: { type: tagType, value: tagValue },
      },
    };
  } else if (tagValue) {
    where.tags = {
      some: {
        definition: { value: tagValue },
      },
    };
  }

  // Full-text search on subject + recent message content
  if (search) {
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      {
        messages: {
          some: { content: { contains: search, mode: "insensitive" } },
        },
      },
    ];
  }

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        assignedAgent: { select: { id: true, name: true, avatarUrl: true } },
        tags: { include: { definition: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, senderType: true, createdAt: true },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.conversation.count({ where }),
  ]);

  return { conversations, total, page, limit };
}

export async function getConversationById(id: string) {
  return prisma.conversation.findUnique({
    where: { id },
    include: {
      user: true,
      assignedAgent: { select: { id: true, name: true, avatarUrl: true, email: true } },
      tags: { include: { definition: true } },
      messages: {
        where: { isStreaming: false },
        orderBy: { createdAt: "asc" },
        include: {
          agent: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
      ticket: true,
    },
  });
}

export async function updateConversationControl(
  id: string,
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
