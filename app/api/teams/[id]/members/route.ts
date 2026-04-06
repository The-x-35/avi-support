import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

// POST /api/teams/[id]/members — add agent to team (admin only)
export const POST = withTiming("POST /api/teams/[id]/members", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (auth.payload.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id: teamId } = await params;
  const { agentId } = await request.json();
  if (!agentId || typeof agentId !== "string") {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }

  const member = await prisma.escalationTeamMember.upsert({
    where: { teamId_agentId: { teamId, agentId } },
    create: { teamId, agentId },
    update: {},
    include: { agent: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
  });

  return NextResponse.json(member, { status: 201 });
});

// DELETE /api/teams/[id]/members?agentId=... — remove agent from team (admin only)
export const DELETE = withTiming("DELETE /api/teams/[id]/members", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (auth.payload.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id: teamId } = await params;
  const agentId = new URL(request.url).searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  await prisma.escalationTeamMember.deleteMany({ where: { teamId, agentId } });
  return NextResponse.json({ success: true });
});
