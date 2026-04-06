import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

// PATCH /api/teams/[id] — rename team (admin only)
export const PATCH = withTiming("PATCH /api/teams/[id]", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (auth.payload.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const { name } = await request.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const team = await prisma.escalationTeam.update({
    where: { id },
    data: { name: name.trim().slice(0, 64) },
    include: { members: { include: { agent: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } } } },
  });

  return NextResponse.json(team);
});

// DELETE /api/teams/[id] (admin only)
export const DELETE = withTiming("DELETE /api/teams/[id]", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (auth.payload.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  await prisma.escalationTeam.delete({ where: { id } });
  return NextResponse.json({ success: true });
});
