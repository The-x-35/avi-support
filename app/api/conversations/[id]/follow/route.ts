import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

// POST — follow a conversation
export const POST = withTiming("POST /api/conversations/[id]/follow", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const conversationId = parseInt(id);

  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true } });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const follower = await prisma.conversationFollower.upsert({
    where: { conversationId_agentId: { conversationId, agentId: auth.payload.agentId } },
    create: { conversationId, agentId: auth.payload.agentId },
    update: {},
  });

  return NextResponse.json(follower, { status: 201 });
});

// DELETE — unfollow a conversation
export const DELETE = withTiming("DELETE /api/conversations/[id]/follow", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const conversationId = parseInt(id);

  await prisma.conversationFollower.deleteMany({
    where: { conversationId, agentId: auth.payload.agentId },
  });

  return NextResponse.json({ success: true });
});
