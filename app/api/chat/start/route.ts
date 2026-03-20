import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Public endpoint — no agent auth required.
// Creates or finds an EndUser + opens a Conversation.
export async function POST(request: NextRequest) {
  const { userId, name, category } = await request.json();

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // Upsert end user
  const user = await prisma.endUser.upsert({
    where: { externalId: userId },
    create: { externalId: userId, name: name ?? null },
    update: { ...(name ? { name } : {}) },
  });

  // Create a new conversation
  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      category: category ?? "GENERAL",
      status: "OPEN",
    },
  });

  return NextResponse.json({
    conversationId: conversation.id,
    userId: user.id,
  });
}
