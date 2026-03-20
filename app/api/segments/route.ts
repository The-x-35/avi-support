import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const segments = await prisma.segment.findMany({
    include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(segments);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { name, description, filters, isPinned } = await request.json();

  const segment = await prisma.segment.create({
    data: {
      name,
      description,
      filters,
      isPinned: isPinned ?? false,
      createdById: auth.payload.agentId,
    },
    include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
  });

  return NextResponse.json(segment, { status: 201 });
}
