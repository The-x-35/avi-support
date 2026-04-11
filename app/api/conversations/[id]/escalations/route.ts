import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";
import type { Category, EscalationStatus } from "@prisma/client";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

const VALID_CATEGORIES = new Set(["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"]);
const VALID_STATUSES = new Set(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);

// GET /api/conversations/[id]/escalations
export const GET = withTiming("GET /api/conversations/[id]/escalations", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);

  const escalations = await prisma.escalation.findMany({
    where: { conversationId: numId },
    include: {
      team: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(escalations);
});

// POST /api/conversations/[id]/escalations
export const POST = withTiming("POST /api/conversations/[id]/escalations", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);
  const body = await request.json();

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 256) : null;
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const categories = Array.isArray(body.categories)
    ? (body.categories as string[]).filter((c) => VALID_CATEGORIES.has(c)) as Category[]
    : [];
  const tagIds = Array.isArray(body.tagIds) ? (body.tagIds as string[]) : [];
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 2000) : null;
  const dueDate = body.dueDate ? new Date(body.dueDate) : null;
  const teamId = typeof body.teamId === "string" ? body.teamId : null;
  const assigneeId = typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : null;
  const status = (typeof body.status === "string" && VALID_STATUSES.has(body.status)
    ? body.status : "OPEN") as EscalationStatus;

  const escalation = await prisma.escalation.create({
    data: { conversationId: numId, title, teamId, assigneeId, categories, tagIds, notes, dueDate, status },
    include: {
      team: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  return NextResponse.json(escalation, { status: 201 });
});
