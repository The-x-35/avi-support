import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

// GET — list followers of a conversation
export const GET = withTiming("GET /api/conversations/[id]/followers", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const conversationId = parseInt(id);

  const followers = await prisma.conversationFollower.findMany({
    where: { conversationId },
    select: { agentId: true, createdAt: true },
    take: 100,
  });

  return NextResponse.json(followers);
});
