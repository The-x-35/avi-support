import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
const VALID_STATUSES = new Set(["ONLINE", "AWAY", "OFFLINE"]);

export async function GET(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const agent = await prisma.agent.findUnique({
    where: { id: auth.payload.agentId },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
    },
  });

  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(agent);
}

export async function PATCH(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { status } = await request.json();
  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const agent = await prisma.agent.update({
    where: { id: auth.payload.agentId },
    data: { status },
    select: { id: true, status: true },
  });

  return NextResponse.json(agent);
}
