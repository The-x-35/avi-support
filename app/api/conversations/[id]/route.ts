import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { getConversationById } from "@/lib/services/conversations";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const VALID_STATUSES = new Set(["OPEN", "PENDING", "RESOLVED", "ESCALATED", "CLOSED"]);
const VALID_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

// 120 reads, 30 writes per agent per minute
const readLimiter = createRateLimiter({ limit: 120, windowMs: 60_000 });
const writeLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!readLimiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const conversation = await getConversationById(id);

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(conversation);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!writeLimiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.status && VALID_STATUSES.has(body.status)) data.status = body.status;
  if (body.priority && VALID_PRIORITIES.has(body.priority)) data.priority = body.priority;
  if (body.assignedAgentId !== undefined) data.assignedAgentId = body.assignedAgentId ?? null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const conversation = await prisma.conversation.update({ where: { id }, data });
  return NextResponse.json(conversation);
}
