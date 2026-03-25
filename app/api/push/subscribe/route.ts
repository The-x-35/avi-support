import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export async function POST(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const agentId = auth.payload.agentId;

  const body = await request.json();
  const { endpoint, keys } = body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { agentId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { agentId, p256dh: keys.p256dh, auth: keys.auth },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const agentId = auth.payload.agentId;

  const { endpoint } = await request.json();
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, agentId } });
  }
  return NextResponse.json({ ok: true });
}
