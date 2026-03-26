import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

// GET /api/chat/[id] — fetch conversation data (messages, status, etc.)
export const GET = withTiming("GET /api/chat/[id]", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!limiter.check(getIP(request))) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);

  const conversation = await prisma.conversation.findUnique({
    where: { id: numId },
    include: {
      messages: {
        where: { isPrivate: false },
        include: {
          agent: { select: { name: true, avatarUrl: true } },
          media: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Clean up any stuck streaming messages (> 5 min old)
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  const stuckIds = conversation.messages
    .filter((m) => m.isStreaming && new Date(m.createdAt) < cutoff)
    .map((m) => m.id);
  if (stuckIds.length > 0) {
    await prisma.message.updateMany({ where: { id: { in: stuckIds } }, data: { isStreaming: false } });
    for (const m of conversation.messages) {
      if (stuckIds.includes(m.id)) (m as { isStreaming: boolean }).isStreaming = false;
    }
  }

  return NextResponse.json(conversation);
});

