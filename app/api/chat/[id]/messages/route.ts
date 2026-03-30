import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";
import { getChatSessionFromRequest } from "@/lib/auth/chat-token";

const readLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
const writeLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

const MAX_CONTENT_LENGTH = 4_000;

async function getOwnedConversation(request: NextRequest, numId: number) {
  const session = await getChatSessionFromRequest(request);
  if (!session) return null;

  const user = await prisma.endUser.findUnique({ where: { externalId: session.userId }, select: { id: true } });
  if (!user) return null;

  return prisma.conversation.findUnique({
    where: { id: numId, userId: user.id },
    select: { id: true, status: true },
  });
}

export const GET = withTiming("GET /api/chat/[id]/messages", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!readLimiter.check(getIP(request))) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const conversation = await getOwnedConversation(request, numId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await prisma.message.findMany({
    where: { conversationId: numId, isPrivate: false },
    include: {
      agent: { select: { name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json(messages);
});

export const POST = withTiming("POST /api/chat/[id]/messages", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!writeLimiter.check(getIP(request))) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const conversation = await getOwnedConversation(request, numId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (conversation.status === "CLOSED") {
    return NextResponse.json({ error: "Conversation is closed" }, { status: 403 });
  }

  const { content } = await request.json();
  if (!content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: `Message too long. Max ${MAX_CONTENT_LENGTH} characters.` }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: { conversationId: numId, senderType: "USER", content: content.trim() },
  });

  await prisma.conversation.update({
    where: { id: numId },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json(message, { status: 201 });
});
