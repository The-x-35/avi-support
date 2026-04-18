import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const readLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
const writeLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!readLimiter.check(auth.payload.agentId)) return tooManyRequests();

  const segments = await prisma.segment.findMany({
    include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return NextResponse.json(segments);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!writeLimiter.check(auth.payload.agentId)) return tooManyRequests();

  const { name, description, filters, isPinned } = await request.json();

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (name.length > 128) {
    return NextResponse.json({ error: "name must be under 128 characters" }, { status: 400 });
  }

  if (filters === undefined || filters === null) {
    return NextResponse.json({ error: "filters are required" }, { status: 400 });
  }

  const segment = await prisma.segment.create({
    data: {
      name: name.trim(),
      description: typeof description === "string" ? description.slice(0, 500) : null,
      filters,
      isPinned: isPinned === true,
      createdById: auth.payload.agentId,
    },
    include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
  });

  return NextResponse.json(segment, { status: 201 });
}
