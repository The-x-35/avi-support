import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

// GET — returns conversation IDs that the current agent is following
export const GET = withTiming("GET /api/conversations/following", async (request: NextRequest) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const rows = await prisma.conversationFollower.findMany({
    where: { agentId: auth.payload.agentId },
    select: { conversationId: true },
  });

  return NextResponse.json(rows.map((r) => r.conversationId));
});
