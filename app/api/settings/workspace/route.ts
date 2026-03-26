import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest, requireRole } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";
import { getWorkspaceSetting, invalidateWorkspaceCache } from "@/lib/workspace-cache";

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  return NextResponse.json(await getWorkspaceSetting());
}

export async function PATCH(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const roleErr = requireRole(auth.payload, "ADMIN");
  if (roleErr) return roleErr;

  const body = await request.json();
  const { aiEnabled, queueMessage, ticketMessage, queueTimeoutMinutes, agentInactivityEnabled, agentInactivityHours } = body;

  const data: Record<string, unknown> = {};
  if (typeof aiEnabled === "boolean") data.aiEnabled = aiEnabled;
  if (typeof queueMessage === "string") data.queueMessage = queueMessage.slice(0, 1000);
  if (typeof ticketMessage === "string") data.ticketMessage = ticketMessage.slice(0, 1000);
  if (typeof queueTimeoutMinutes === "number" && queueTimeoutMinutes >= 1) {
    data.queueTimeoutMinutes = Math.min(queueTimeoutMinutes, 60);
  }
  if (typeof agentInactivityEnabled === "boolean") data.agentInactivityEnabled = agentInactivityEnabled;
  const VALID_INACTIVITY_HOURS = new Set([1, 2, 3, 4, 6, 8]);
  if (typeof agentInactivityHours === "number" && VALID_INACTIVITY_HOURS.has(agentInactivityHours)) {
    data.agentInactivityHours = agentInactivityHours;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const setting = await prisma.workspaceSetting.upsert({
    where: { id: "default" },
    create: { id: "default", aiEnabled: true, ...data },
    update: data,
  });

  invalidateWorkspaceCache();
  return NextResponse.json(setting);
}
