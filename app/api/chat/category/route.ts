import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

const VALID_CATEGORIES = new Set(["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"]);

const CATEGORY_LABELS: Record<string, string> = {
  CARDS: "Cards",
  ACCOUNT: "Account",
  SPENDS: "Spends",
  KYC: "KYC",
  GENERAL: "General",
  OTHER: "Other",
};

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

export async function POST(req: NextRequest) {
  if (!limiter.check(getIP(req))) return tooManyRequests();

  const body = await req.json();
  const { conversationId, category } = body;

  if (!conversationId || typeof conversationId !== "string") {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }
  if (!category || !VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  // Update conversation category
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { category },
  });

  // Upsert issue_type tag to match new category
  const label = CATEGORY_LABELS[category] ?? category;
  const definition = await prisma.tagDefinition.upsert({
    where: { type_value: { type: "issue_type", value: category.toLowerCase() } },
    create: { type: "issue_type", value: category.toLowerCase(), label },
    update: {},
  });

  // Remove any other issue_type tags for this conversation
  const existingDefs = await prisma.tagDefinition.findMany({
    where: { type: "issue_type", id: { not: definition.id } },
    select: { id: true },
  });
  if (existingDefs.length > 0) {
    await prisma.tag.deleteMany({
      where: {
        conversationId,
        definitionId: { in: existingDefs.map((d) => d.id) },
      },
    });
  }

  // Upsert the new one
  await prisma.tag.upsert({
    where: { conversationId_definitionId: { conversationId, definitionId: definition.id } },
    create: { conversationId, definitionId: definition.id, source: "SYSTEM" },
    update: { source: "SYSTEM", updatedAt: new Date() },
  });

  return NextResponse.json({ success: true, category });
}
