import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";
import type { Category, EscalationStatus } from "@prisma/client";

const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

const VALID_CATEGORIES = new Set(["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"]);
const VALID_STATUSES   = new Set(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
const VALID_SORTS      = new Set(["createdAt", "updatedAt", "dueDate", "title", "status"]);

// GET /api/escalations — list all escalations with filters/sort/pagination
export const GET = withTiming("GET /api/escalations", async (request: NextRequest) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const sp = new URL(request.url).searchParams;

  // Filters
  const status    = sp.getAll("status").filter((s) => VALID_STATUSES.has(s)) as EscalationStatus[];
  const category  = sp.getAll("category").filter((c) => VALID_CATEGORIES.has(c)) as Category[];
  const teamId    = sp.getAll("teamId").filter(Boolean);
  const q         = sp.get("q")?.trim() ?? "";
  const dueBefore = sp.get("dueBefore");
  const dueAfter  = sp.get("dueAfter");
  const hasNotes  = sp.get("hasNotes");
  const hasDue    = sp.get("hasDue");

  // Sort
  const sortField = VALID_SORTS.has(sp.get("sort") ?? "") ? (sp.get("sort") as string) : "createdAt";
  const sortDir   = sp.get("dir") === "asc" ? "asc" : "desc";

  // Pagination
  const page  = Math.max(1, parseInt(sp.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "50") || 50));
  const skip  = (page - 1) * limit;

  // Build where
  const where: Record<string, unknown> = {};
  if (status.length)   where.status     = { in: status };
  if (category.length) where.categories = { hasSome: category };
  if (teamId.length)   where.teamId     = { in: teamId };
  if (q)               where.title      = { contains: q, mode: "insensitive" };
  if (dueBefore)       where.dueDate    = { ...(where.dueDate as object ?? {}), lte: new Date(dueBefore) };
  if (dueAfter)        where.dueDate    = { ...(where.dueDate as object ?? {}), gte: new Date(dueAfter) };
  if (hasNotes === "true")  where.notes = { not: null };
  if (hasNotes === "false") where.notes = null;
  if (hasDue === "true")    where.dueDate = { not: null };
  if (hasDue === "false")   where.dueDate = null;

  const [escalations, total] = await Promise.all([
    prisma.escalation.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      skip,
      take: limit,
      include: {
        team: { select: { id: true, name: true } },
        conversation: {
          select: {
            id: true,
            status: true,
            categories: true,
            user: { select: { id: true, name: true, email: true, avatarUrl: true, externalId: true } },
          },
        },
      },
    }),
    prisma.escalation.count({ where }),
  ]);

  return NextResponse.json({
    escalations,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});
