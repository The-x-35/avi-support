import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export const GET = withTiming("GET /api/conversations/[id]/notes", async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50");
  const limit = Math.min(Math.max(1, Number.isNaN(rawLimit) ? 50 : rawLimit), 100);

  const notes = await prisma.note.findMany({
    where: { conversationId: numId },
    include: { agent: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = notes.length > limit;
  if (hasMore) notes.pop();

  return NextResponse.json({ notes, hasMore });
});

export const POST = withTiming("POST /api/conversations/[id]/notes", async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);
  const { content } = await request.json();
  if (!content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });

  const note = await prisma.note.create({
    data: { conversationId: numId, agentId: auth.payload.agentId, content: content.trim() },
    include: { agent: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return NextResponse.json(note, { status: 201 });
});

export const DELETE = withTiming("DELETE /api/conversations/[id]/notes", async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);
  const noteId = new URL(request.url).searchParams.get("noteId");
  if (!noteId) return NextResponse.json({ error: "noteId required" }, { status: 400 });

  await prisma.note.deleteMany({ where: { id: noteId, conversationId: numId, agentId: auth.payload.agentId } });
  return NextResponse.json({ success: true });
});
