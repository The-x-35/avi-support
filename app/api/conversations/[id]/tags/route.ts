import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

// GET /api/conversations/[id]/tags — list all tags on a conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);
  const tags = await prisma.tag.findMany({
    where: { conversationId: numId },
    include: { definition: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(tags);
}

// POST /api/conversations/[id]/tags — add a tag (by definitionId or create new)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);
  const { definitionId, name, color } = await request.json();

  let defId: string;

  if (definitionId) {
    defId = definitionId;
  } else if (typeof name === "string" && name.trim()) {
    // Create or find tag definition by name
    const trimmed = name.trim().slice(0, 64);
    const def = await prisma.tagDefinition.upsert({
      where: { name: trimmed },
      create: { name: trimmed, color: typeof color === "string" ? color.slice(0, 32) : null },
      update: {},
    });
    defId = def.id;
  } else {
    return NextResponse.json({ error: "definitionId or name required" }, { status: 400 });
  }

  const tag = await prisma.tag.upsert({
    where: { conversationId_definitionId: { conversationId: numId, definitionId: defId } },
    create: { conversationId: numId, definitionId: defId },
    update: {},
    include: { definition: true },
  });

  return NextResponse.json(tag, { status: 201 });
}

// DELETE /api/conversations/[id]/tags?tagId=... — remove a tag from a conversation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);
  const tagId = new URL(request.url).searchParams.get("tagId");

  if (!tagId) return NextResponse.json({ error: "tagId required" }, { status: 400 });

  await prisma.tag.deleteMany({ where: { id: tagId, conversationId: numId } });
  return NextResponse.json({ success: true });
}
