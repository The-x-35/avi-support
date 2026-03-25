import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest, requireRole } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

async function getSetting() {
  return prisma.workspaceSetting.upsert({
    where: { id: "default" },
    create: { id: "default", aiEnabled: true },
    update: {},
  });
}

export async function GET(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const setting = await getSetting();
  return NextResponse.json(setting);
}

export async function PATCH(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const roleErr = requireRole(auth.payload, "ADMIN");
  if (roleErr) return roleErr;

  const body = await request.json();
  const { aiEnabled, queueMessage, ticketMessage, queueTimeoutMinutes } = body;

  const data: Record<string, unknown> = {};
  if (typeof aiEnabled === "boolean") data.aiEnabled = aiEnabled;
  if (typeof queueMessage === "string") data.queueMessage = queueMessage.slice(0, 1000);
  if (typeof ticketMessage === "string") data.ticketMessage = ticketMessage.slice(0, 1000);
  if (typeof queueTimeoutMinutes === "number" && queueTimeoutMinutes >= 1) {
    data.queueTimeoutMinutes = Math.min(queueTimeoutMinutes, 60);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const setting = await prisma.workspaceSetting.upsert({
    where: { id: "default" },
    create: { id: "default", aiEnabled: true, ...data },
    update: data,
  });
  return NextResponse.json(setting);
}
