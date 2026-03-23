import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

// Read: 60 per IP per minute
const readLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
// Write: 30 messages per IP per minute — prevents message flood
const writeLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

const MAX_CONTENT_LENGTH = 4_000; // chars

// Public endpoint — loads messages for a conversation.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!readLimiter.check(getIP(request))) return tooManyRequests();

  const { id } = await params;

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    include: {
      agent: { select: { name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 200, // hard cap — no unbounded queries
  });

  return NextResponse.json(messages);
}

// Public endpoint — user sends a message.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!writeLimiter.check(getIP(request))) return tooManyRequests();

  const { id } = await params;
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

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (conversation.status === "CLOSED") {
    return NextResponse.json({ error: "Conversation is closed" }, { status: 403 });
  }

  const message = await prisma.message.create({
    data: {
      conversationId: id,
      senderType: "USER",
      content: content.trim(),
    },
  });

  await prisma.conversation.update({
    where: { id },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json(message, { status: 201 });
}
