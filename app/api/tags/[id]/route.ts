import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

// PATCH /api/tags/[id] — edit tag name/color
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (auth.payload.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const { name, color } = await request.json();

  const data: { name?: string; color?: string | null } = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim().slice(0, 64);
  if (color !== undefined) data.color = typeof color === "string" ? color.slice(0, 32) : null;

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const tag = await prisma.tagDefinition.update({ where: { id }, data });
  return NextResponse.json(tag);
}

// DELETE /api/tags/[id] — delete a tag definition (cascades to conversation tags)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (auth.payload.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  await prisma.tagDefinition.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
