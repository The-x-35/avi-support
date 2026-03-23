import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const user = await prisma.endUser.findUnique({ where: { externalId: userId } });
  if (!user) return NextResponse.json([]);

  const conversations = await prisma.conversation.findMany({
    where: {
      userId: user.id,
      status: { not: "CLOSED" },
      messages: {
        some: {
          isStreaming: false,
          content: { not: "" },
        },
      },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 10,
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
}
