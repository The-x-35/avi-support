import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

const VALID_CATEGORIES = new Set(["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"]);

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

export async function POST(req: NextRequest) {
  if (!limiter.check(getIP(req))) return tooManyRequests();

  const body = await req.json();
  const { conversationId, category } = body;

  const numId = parseInt(conversationId);
  if (!numId || isNaN(numId)) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }
  if (!category || !VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  await prisma.conversation.update({
    where: { id: numId },
    data: { category },
  });

  return NextResponse.json({ success: true, category });
}
