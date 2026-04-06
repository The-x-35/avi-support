import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createNotifications } from "@/lib/notifications";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";
import { getChatSessionFromRequest } from "@/lib/auth/chat-token";

const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

const VALID_CATEGORIES = new Set(["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"]);

const DEFAULT_QUEUE_MESSAGE =
  "All our agents are currently busy. You have been added to the queue and someone will be with you as soon as possible.";

export async function POST(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();

  const session = await getChatSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, category } = body;

  const sanitizedName = typeof name === "string" ? name.slice(0, 128) : null;
  const safeCategory = VALID_CATEGORIES.has(category) ? category : "GENERAL";

  const user = await prisma.endUser.upsert({
    where: { externalId: session.userId },
    create: { externalId: session.userId, name: sanitizedName },
    update: { ...(sanitizedName ? { name: sanitizedName } : {}) },
  });

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

  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      categories: [safeCategory],
      status: "OPEN",
      ...(hasCapacity ? {} : { queuedAt: new Date() }),
    },
  });

  if (!hasCapacity) {
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
