import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

const MAX_CONTENT_LENGTH = 4_000;

const readLimiter = createRateLimiter({ limit: 120, windowMs: 60_000 });
const writeLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export const GET = withTiming("GET /api/conversations/[id]/messages", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!readLimiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const rawLimit = parseInt(searchParams.get("limit") ?? "50");
  const limit = Math.min(Math.max(1, rawLimit), 100);

  const messages = await prisma.message.findMany({
    where: { conversationId: numId },
    include: {
      agent: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "asc" },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit,
  });

  return NextResponse.json({
    messages,
    nextCursor: messages.length === limit ? messages[messages.length - 1].id : null,
  });
});

export const POST = withTiming("POST /api/conversations/[id]/messages", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!writeLimiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);
  const { content } = await request.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: `Message too long. Max ${MAX_CONTENT_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const message = await prisma.message.create({
    data: {
      conversationId: numId,
      senderType: "AGENT",
      senderId: auth.payload.agentId,
      content: content.trim(),
    },
    include: {
      agent: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  await prisma.conversation.update({
    where: { id: numId },
    data: {
      lastMessageAt: new Date(),
      assignedAgentId: auth.payload.agentId,
      isAiPaused: true,
    },
  });

  return NextResponse.json(message, { status: 201 });
});
