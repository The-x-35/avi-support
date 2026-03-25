import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

// GET /api/tags — list all tag definitions
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const tags = await prisma.tagDefinition.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true, createdAt: true },
  });

  return NextResponse.json(tags);
}

// POST /api/tags — create a new tag definition
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { name, color } = await request.json();

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const trimmed = name.trim().slice(0, 64);

  const existing = await prisma.tagDefinition.findUnique({ where: { name: trimmed } });
  if (existing) return NextResponse.json({ error: "Tag already exists" }, { status: 409 });

  const tag = await prisma.tagDefinition.create({
    data: { name: trimmed, color: typeof color === "string" ? color.slice(0, 32) : null },
  });

  return NextResponse.json(tag, { status: 201 });
}
