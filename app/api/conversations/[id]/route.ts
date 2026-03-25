import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { getConversationById } from "@/lib/services/conversations";
import { prisma } from "@/lib/db/prisma";
import { createNotifications } from "@/lib/notifications";
import { pushNotificationToAgent } from "@/lib/ws-push";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const VALID_STATUSES = new Set(["OPEN", "PENDING", "RESOLVED", "ESCALATED", "CLOSED"]);
const VALID_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const VALID_CATEGORIES = new Set(["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"]);

// 120 reads, 30 writes per agent per minute
const readLimiter = createRateLimiter({ limit: 120, windowMs: 60_000 });
const writeLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!readLimiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);
  const conversation = await getConversationById(numId);

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(conversation);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!writeLimiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const numId = parseInt(id);
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.status && VALID_STATUSES.has(body.status)) data.status = body.status;
  if (body.priority && VALID_PRIORITIES.has(body.priority)) data.priority = body.priority;
  if (body.category && VALID_CATEGORIES.has(body.category)) data.category = body.category;
  if (body.assignedAgentId !== undefined) data.assignedAgentId = body.assignedAgentId ?? null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Fetch current assignment before updating so we can detect changes
  const before = data.assignedAgentId !== undefined
    ? await prisma.conversation.findUnique({ where: { id: numId }, select: { assignedAgentId: true, user: { select: { name: true, externalId: true } } } })
    : null;

  const conversation = await prisma.conversation.update({ where: { id: numId }, data });

  // If conversation was just assigned to a (different) agent, notify them
  const newAgentId = data.assignedAgentId as string | null | undefined;
  if (
    newAgentId &&
    newAgentId !== before?.assignedAgentId &&
    newAgentId !== auth.payload.agentId // don't notify yourself
  ) {
    const userName = before?.user?.name ?? before?.user?.externalId ?? "A user";
    const title = "Conversation assigned to you";
    const body = `${userName}'s conversation has been assigned to you.`;

    createNotifications({
      agentIds: [newAgentId],
      type: "ASSIGNED",
      title,
      body,
      conversationId: numId,
    }).then(([notifId]) => {
      if (!notifId) return;
      pushNotificationToAgent(newAgentId, {
        id: notifId,
        type: "ASSIGNED",
        title,
        body,
        conversationId: id,
        createdAt: new Date().toISOString(),
      });
    }).catch(() => {});
  }

  return NextResponse.json(conversation);
}
