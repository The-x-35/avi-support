import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const { title, content } = await request.json();
  const data: Record<string, string> = {};
  if (title?.trim()) data.title = title.trim();
  if (content?.trim()) data.content = content.trim();

  const response = await prisma.cannedResponse.updateMany({
    where: { id, agentId: auth.payload.agentId },
    data,
  });
  if (response.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  await prisma.cannedResponse.deleteMany({ where: { id, agentId: auth.payload.agentId } });
  return NextResponse.json({ success: true });
}
