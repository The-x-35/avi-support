import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    data.name = body.name.slice(0, 128).trim();
  }
  if (body.description !== undefined) {
    data.description = typeof body.description === "string" ? body.description.slice(0, 500) : null;
  }
  if (typeof body.isPinned === "boolean") data.isPinned = body.isPinned;
  if (body.filters !== undefined) {
    if (
      typeof body.filters !== "object" ||
      !Array.isArray(body.filters.conditions) ||
      !["AND", "OR"].includes(body.filters.operator)
    ) {
      return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
    }
    data.filters = body.filters;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Admins can edit any segment; agents can only edit their own
  const ownershipFilter = auth.payload.role === "ADMIN" ? { id } : { id, createdById: auth.payload.agentId };
  const segment = await prisma.segment.update({ where: ownershipFilter, data }).catch(() => null);
  if (!segment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(segment);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;

  // Admins can delete any segment; agents can only delete their own
  const ownershipFilter = auth.payload.role === "ADMIN" ? { id } : { id, createdById: auth.payload.agentId };
  const deleted = await prisma.segment.deleteMany({ where: ownershipFilter });
  if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
