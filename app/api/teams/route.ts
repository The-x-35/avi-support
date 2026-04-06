import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

// GET /api/teams — list all teams with members
export const GET = withTiming("GET /api/teams", async (request: NextRequest) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const teams = await prisma.escalationTeam.findMany({
    orderBy: { name: "asc" },
    include: {
      members: {
        include: { agent: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json(teams);
});

// POST /api/teams — create a team (admin only)
export const POST = withTiming("POST /api/teams", async (request: NextRequest) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (auth.payload.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { name } = await request.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const team = await prisma.escalationTeam.create({
    data: { name: name.trim().slice(0, 64) },
    include: { members: { include: { agent: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } } } },
  });

  return NextResponse.json(team, { status: 201 });
});
