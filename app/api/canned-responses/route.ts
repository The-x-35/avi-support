import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

const DEFAULTS = [
  {
    title: "Greeting",
    content: "Hi! Thanks for reaching out. I'm looking into this for you right now.",
  },
  {
    title: "Need more info",
    content: "Could you please share a bit more detail so I can help you better?",
  },
  {
    title: "Escalating",
    content: "I'm escalating this to our specialist team. You'll hear back shortly.",
  },
  {
    title: "Resolved",
    content: "Great news — this has been resolved on our end. Let us know if anything else comes up!",
  },
  {
    title: "Follow up",
    content: "Just checking in — were you able to get this sorted? Happy to help if not.",
  },
];

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const existing = await prisma.cannedResponse.findMany({
    where: { agentId: auth.payload.agentId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  // Seed defaults for new agents
  if (existing.length === 0) {
    const seeded = await prisma.cannedResponse.createManyAndReturn({
      data: DEFAULTS.map((d) => ({ ...d, agentId: auth.payload.agentId })),
    });
    return NextResponse.json(seeded);
  }

  return NextResponse.json(existing);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { title, content } = await request.json();
  if (!title?.trim() || !content?.trim())
    return NextResponse.json({ error: "title and content required" }, { status: 400 });

  const response = await prisma.cannedResponse.create({
    data: { agentId: auth.payload.agentId, title: title.trim(), content: content.trim() },
  });
  return NextResponse.json(response, { status: 201 });
}
