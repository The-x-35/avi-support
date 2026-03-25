import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest, requireRole } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const VALID_ROLES = new Set(["ADMIN", "AGENT"]);
const VALID_STATUSES = new Set(["ONLINE", "AWAY", "OFFLINE"]);

const readLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
// Admin mutations are rare — 10 per minute is generous
const writeLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!readLimiter.check(auth.payload.agentId)) return tooManyRequests();

  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      role: true,
      status: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(agents);
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  // All mutations on other agents require ADMIN
  const roleError = requireRole(auth.payload, "ADMIN");
  if (roleError) return roleError;

  if (!writeLimiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id, role, isActive, status, maxConcurrentChats } = await request.json();

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (role !== undefined) {
    if (!VALID_ROLES.has(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    data.role = role;
  }
  if (typeof isActive === "boolean") data.isActive = isActive;
  if (status !== undefined) {
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = status;
  }
  if (typeof maxConcurrentChats === "number" && maxConcurrentChats >= 1) {
    data.maxConcurrentChats = Math.min(maxConcurrentChats, 100);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const agent = await prisma.agent.update({ where: { id }, data });
  return NextResponse.json(agent);
}
