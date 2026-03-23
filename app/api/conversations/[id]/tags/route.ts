import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const tags = await prisma.tag.findMany({
    where: { conversationId: id },
    include: { definition: true },
  });

  return NextResponse.json(tags);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const { type, value, label, color } = await request.json();

  if (!type || !value || typeof type !== "string" || typeof value !== "string") {
    return NextResponse.json({ error: "type and value are required" }, { status: 400 });
  }

  if (type.length > 64 || value.length > 64) {
    return NextResponse.json({ error: "type and value must be under 64 characters" }, { status: 400 });
  }

  const definition = await prisma.tagDefinition.upsert({
    where: { type_value: { type, value } },
    create: {
      type,
      value,
      label: typeof label === "string" ? label.slice(0, 128) : value,
      color: typeof color === "string" ? color.slice(0, 32) : null,
    },
    update: {},
  });

  const tag = await prisma.tag.upsert({
    where: {
      conversationId_definitionId: {
        conversationId: id,
        definitionId: definition.id,
      },
    },
    create: {
      conversationId: id,
      definitionId: definition.id,
      source: "AGENT",
    },
    update: { source: "AGENT", updatedAt: new Date() },
    include: { definition: true },
  });

  return NextResponse.json(tag, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const tagId = searchParams.get("tagId");

  if (!tagId) {
    return NextResponse.json({ error: "tagId required" }, { status: 400 });
  }

  await prisma.tag.deleteMany({
    where: { id: tagId, conversationId: id },
  });

  return NextResponse.json({ success: true });
}
