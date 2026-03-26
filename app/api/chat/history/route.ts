import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";
import { getChatSessionFromRequest } from "@/lib/auth/chat-token";

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export const GET = withTiming("GET /api/chat/history", async (request: NextRequest) => {
  if (!limiter.check(getIP(request))) return tooManyRequests();

  const session = await getChatSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.endUser.findUnique({ where: { externalId: session.userId } });
  if (!user) return NextResponse.json([]);

  const conversations = await prisma.conversation.findMany({
    where: {
      userId: user.id,
      messages: {
        some: {
          isStreaming: false,
          content: { not: "" },
        },
      },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 20,
    select: {
      id: true,
      category: true,
      status: true,
      createdAt: true,
      lastMessageAt: true,
      messages: {
        where: {
          isStreaming: false,
          content: { not: "" },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          content: true,
          senderType: true,
          media: { select: { fileName: true } },
        },
      },
    },
  });

  return NextResponse.json({ conversations });
});
