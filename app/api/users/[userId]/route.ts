import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { userId } = await params;

  const user = await prisma.endUser.findUnique({
    where: { id: userId },
    include: {
      conversations: {
        include: {
          tags: { include: { definition: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: { select: { messages: true } },
        },
        orderBy: { lastMessageAt: "desc" },
        take: 50, // cap — don't load unbounded conversation history
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}
