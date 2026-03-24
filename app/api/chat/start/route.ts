import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createNotifications } from "@/lib/notifications";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

// 5 new conversations per IP per minute — prevents spam-creating conversations
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

const VALID_CATEGORIES = new Set(["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"]);

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

  // Create a new conversation
  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      category: safeCategory,
      status: "OPEN",
    },
  });

  // Notify all active agents of new conversation (fire-and-forget)
  prisma.agent.findMany({ where: { isActive: true }, select: { id: true } }).then((agents) => {
    const agentIds = agents.map((a) => a.id);
    const title = "New conversation started";
    const body = `${sanitizedName ?? "A user"} started a new ${safeCategory.toLowerCase()} conversation.`;
    return createNotifications({ agentIds, type: "NEW_CONVERSATION", title, body, conversationId: conversation.id });
  }).catch(() => {});

  return NextResponse.json({
    conversationId: conversation.id,
    userId: user.id,
  });
}
