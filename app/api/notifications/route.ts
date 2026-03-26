import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export const GET = withTiming("GET /api/notifications", async (request: NextRequest) => {
  if (!limiter.check(getIP(request))) return tooManyRequests();
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const agentId = auth.payload.agentId;

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const parsed = parseInt(url.searchParams.get("limit") ?? "30");
  const limit = Math.min(Number.isNaN(parsed) ? 30 : parsed, 100);

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.notification.count({ where: { agentId, isRead: false } }),
  ]);

  const hasMore = notifications.length > limit;
  if (hasMore) notifications.pop();

  return NextResponse.json({ notifications, unreadCount, hasMore });
});

export const PATCH = withTiming("PATCH /api/notifications", async (request: NextRequest) => {
  if (!limiter.check(getIP(request))) return tooManyRequests();
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const agentId = auth.payload.agentId;

  const body = await request.json().catch(() => ({}));
  const { id } = body as { id?: string };

  if (id) {
    await prisma.notification.updateMany({
      where: { id, agentId },
      data: { isRead: true },
    });
  } else {
    await prisma.notification.updateMany({
      where: { agentId, isRead: false },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
});
