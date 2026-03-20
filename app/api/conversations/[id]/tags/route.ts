import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

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

  const { id } = await params;
  const { type, value, label, color } = await request.json();

  const definition = await prisma.tagDefinition.upsert({
    where: { type_value: { type, value } },
    create: { type, value, label: label ?? value, color },
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
