import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";
import type { Category, EscalationStatus } from "@prisma/client";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
const VALID_CATEGORIES = new Set(["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"]);
const VALID_STATUSES = new Set(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);

// PATCH /api/conversations/[id]/escalations/[eid]
export const PATCH = withTiming("PATCH escalation", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; eid: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { eid } = await params;
  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 256);
  if (Array.isArray(body.categories)) data.categories = (body.categories as string[]).filter((c) => VALID_CATEGORIES.has(c)) as Category[];
  if (Array.isArray(body.tagIds)) data.tagIds = body.tagIds as string[];
  if (typeof body.notes === "string") data.notes = body.notes.slice(0, 2000);
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.teamId !== undefined) data.teamId = body.teamId ?? null;
  if (typeof body.status === "string" && VALID_STATUSES.has(body.status)) data.status = body.status as EscalationStatus;

  const escalation = await prisma.escalation.update({
    where: { id: eid },
    data,
    include: { team: { select: { id: true, name: true } } },
  });

  return NextResponse.json(escalation);
});

// DELETE /api/conversations/[id]/escalations/[eid]
export const DELETE = withTiming("DELETE escalation", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; eid: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { eid } = await params;
  await prisma.escalation.delete({ where: { id: eid } });
  return NextResponse.json({ success: true });
});
