import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createNotifications } from "@/lib/notifications";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

// 5 new conversations per IP per minute — prevents spam-creating conversations
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

const VALID_CATEGORIES = new Set(["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"]);

const DEFAULT_QUEUE_MESSAGE =
  "All our agents are currently busy. You have been added to the queue and someone will be with you as soon as possible.";

export async function POST(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();

  const { userId, name, category } = await request.json();

  if (!userId || typeof userId !== "string" || userId.length > 128) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const sanitizedName = typeof name === "string" ? name.slice(0, 128) : null;
  const safeCategory = VALID_CATEGORIES.has(category) ? category : "GENERAL";

  // Upsert end user
  const user = await prisma.endUser.upsert({
    where: { externalId: userId },
    create: { externalId: userId, name: sanitizedName },
    update: { ...(sanitizedName ? { name: sanitizedName } : {}) },
  });

  // Check if any online agent has capacity
  const onlineAgents = await prisma.agent.findMany({
    where: { isActive: true, status: "ONLINE" },
    select: { id: true, maxConcurrentChats: true },
  });

  let hasCapacity = false;
  if (onlineAgents.length > 0) {
    const openCounts = await Promise.all(
      onlineAgents.map((agent) =>
        prisma.conversation
          .count({ where: { assignedAgentId: agent.id, status: "OPEN" } })
          .then((count) => ({ agent, count }))
      )
    );
    hasCapacity = openCounts.some(({ agent, count }) => count < agent.maxConcurrentChats);
  }

  // Create a new conversation (queued if no capacity)
  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      category: safeCategory,
      status: "OPEN",
      ...(hasCapacity ? {} : { queuedAt: new Date() }),
    },
  });

  if (!hasCapacity) {
    // Send queue message to user
    const setting = await prisma.workspaceSetting.findUnique({ where: { id: "default" } });
    const queueMsg = setting?.queueMessage?.trim() || DEFAULT_QUEUE_MESSAGE;
    await prisma.message.create({
      data: { conversationId: conversation.id, senderType: "AI", content: queueMsg, isStreaming: false },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
  } else {
    // Notify all active ONLINE agents of new conversation (fire-and-forget)
    prisma.agent
      .findMany({ where: { isActive: true, status: "ONLINE" }, select: { id: true } })
      .then((agents) => {
        const agentIds = agents.map((a) => a.id);
        const title = "New conversation started";
        const body = `${sanitizedName ?? "A user"} started a new ${safeCategory.toLowerCase()} conversation.`;
        return createNotifications({ agentIds, type: "NEW_CONVERSATION", title, body, conversationId: conversation.id });
      })
      .catch(() => {});
  }

  return NextResponse.json({
    conversationId: conversation.id,
    userId: user.id,
    queued: !hasCapacity,
  });
}
