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

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const segment = await prisma.segment.update({ where: { id }, data });
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
  await prisma.segment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
