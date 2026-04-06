import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createNotifications } from "@/lib/notifications";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";
import { getChatSessionFromRequest } from "@/lib/auth/chat-token";
import type { Category } from "@prisma/client";

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
const VALID_CATEGORIES = new Set(["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"]);

export async function POST(req: NextRequest) {
  if (!limiter.check(getIP(req))) return tooManyRequests();

  const session = await getChatSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { category, name } = body;

  const uid = session.userId;
  const safeCategory = (VALID_CATEGORIES.has(category ?? "") ? category! : "GENERAL") as Category;
  const safeCategories = [safeCategory];
  const sanitizedName = typeof name === "string" ? name.slice(0, 128) : null;

  const user = await prisma.endUser.upsert({
    where: { externalId: uid },
    create: { externalId: uid, name: sanitizedName },
    update: { ...(sanitizedName ? { name: sanitizedName } : {}) },
  });

  // Single query to check if any online agent has capacity
  const capacityResult = await prisma.$queryRaw<{ has_capacity: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "Agent" a
      WHERE a."isActive" = true AND a."status" = 'ONLINE'
        AND (SELECT COUNT(*) FROM "Conversation" c WHERE c."assignedAgentId" = a."id" AND c."status" = 'OPEN') < a."maxConcurrentChats"
    ) as has_capacity
  `;
  const hasCapacity = capacityResult[0]?.has_capacity ?? false;

  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      categories: safeCategories,
      status: "OPEN",
      ...(hasCapacity ? {} : { queuedAt: new Date() }),
    },
  });

  if (!hasCapacity) {
    const setting = await prisma.workspaceSetting.findUnique({ where: { id: "default" } });
    const queueMsg =
      setting?.queueMessage?.trim() ||
      "All our agents are currently busy. You have been added to the queue and someone will be with you as soon as possible.";
    await Promise.all([
      prisma.message.create({
        data: { conversationId: conversation.id, senderType: "AI", content: queueMsg, isStreaming: false },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      }),
    ]);
  } else {
    prisma.agent
      .findMany({ where: { isActive: true, status: "ONLINE" }, select: { id: true } })
      .then((agents) => {
        const agentIds = agents.map((a) => a.id);
        const title = "New conversation started";
        const body = `${sanitizedName ?? "A user"} started a new ${safeCategories.map((c) => c.toLowerCase()).join(", ")} conversation.`;
        return createNotifications({
          agentIds,
          type: "NEW_CONVERSATION",
          title,
          body,
          conversationId: conversation.id,
        });
      })
      .catch(() => {});
  }

  return NextResponse.json({ conversationId: conversation.id });
}
