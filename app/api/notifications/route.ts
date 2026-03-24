import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authenticateRequest } from "@/lib/auth/api-auth";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const agentId = auth.payload.agentId;

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30"), 100);

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
}

export async function PATCH(request: NextRequest) {
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
}
