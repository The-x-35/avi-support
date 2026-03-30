import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export const POST = withTiming("POST /api/conversations/[id]/merge", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const targetId = parseInt(id);
  if (isNaN(targetId)) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  const body = await request.json();
  const sourceIds: number[] = body.sourceConversationIds;

  if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
    return NextResponse.json({ error: "sourceConversationIds must be a non-empty array" }, { status: 400 });
  }
  if (sourceIds.some((id) => typeof id !== "number" || isNaN(id))) {
    return NextResponse.json({ error: "All sourceConversationIds must be numbers" }, { status: 400 });
  }
  if (sourceIds.includes(targetId)) {
    return NextResponse.json({ error: "Cannot merge a conversation into itself" }, { status: 400 });
  }

  const target = await prisma.conversation.findUnique({
    where: { id: targetId },
    select: { id: true, userId: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Target conversation not found" }, { status: 404 });
  }

  const sources = await prisma.conversation.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, userId: true },
  });
  if (sources.length !== sourceIds.length) {
    const found = new Set(sources.map((s) => s.id));
    const missing = sourceIds.filter((id) => !found.has(id));
    return NextResponse.json({ error: `Conversations not found: ${missing.join(", ")}` }, { status: 404 });
  }

  const wrongUser = sources.filter((s) => s.userId !== target.userId);
  if (wrongUser.length > 0) {
    return NextResponse.json(
      { error: "All conversations must belong to the same user" },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    // 1. Move messages
    await tx.message.updateMany({
      where: { conversationId: { in: sourceIds } },
      data: { conversationId: targetId },
    });

    // 2. Move notes
    await tx.note.updateMany({
      where: { conversationId: { in: sourceIds } },
      data: { conversationId: targetId },
    });

    // 3. Migrate tags (handle unique constraint)
    const existingTargetTags = await tx.tag.findMany({
      where: { conversationId: targetId },
      select: { definitionId: true, source: true },
    });
    const existingKeys = new Set(
      existingTargetTags.map((t) => `${t.definitionId}:${t.source}`)
    );

    const sourceTags = await tx.tag.findMany({
      where: { conversationId: { in: sourceIds } },
    });

    const tagsToCreate = sourceTags.filter(
      (t) => !existingKeys.has(`${t.definitionId}:${t.source}`)
    );

    if (tagsToCreate.length > 0) {
      await tx.tag.createMany({
        data: tagsToCreate.map((t) => ({
          conversationId: targetId,
          definitionId: t.definitionId,
          source: t.source,
        })),
        skipDuplicates: true,
      });
    }

    await tx.tag.deleteMany({
      where: { conversationId: { in: sourceIds } },
    });

    // 4. Migrate followers (handle unique constraint)
    const existingFollowers = await tx.conversationFollower.findMany({
      where: { conversationId: targetId },
      select: { agentId: true },
    });
    const existingAgentIds = new Set(existingFollowers.map((f) => f.agentId));

    const sourceFollowers = await tx.conversationFollower.findMany({
      where: { conversationId: { in: sourceIds } },
    });

    const followersToCreate = sourceFollowers.filter(
      (f) => !existingAgentIds.has(f.agentId)
    );

    if (followersToCreate.length > 0) {
      await tx.conversationFollower.createMany({
        data: followersToCreate.map((f) => ({
          conversationId: targetId,
          agentId: f.agentId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.conversationFollower.deleteMany({
      where: { conversationId: { in: sourceIds } },
    });

    // 5. System message documenting the merge
    const mergedIds = sourceIds.map((id) => `#${id}`).join(", ");
    await tx.message.create({
      data: {
        conversationId: targetId,
        senderType: "AI",
        content: `[System] Conversations ${mergedIds} were merged into this conversation.`,
      },
    });

    // 6. Update target's lastMessageAt to the latest across all messages
    const latest = await tx.message.findFirst({
      where: { conversationId: targetId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (latest) {
      await tx.conversation.update({
        where: { id: targetId },
        data: { lastMessageAt: latest.createdAt },
      });
    }

    // 7. Close source conversations
    await tx.conversation.updateMany({
      where: { id: { in: sourceIds } },
      data: { status: "CLOSED" },
    });
  });

  const merged = await prisma.conversation.findUnique({
    where: { id: targetId },
    include: {
      user: true,
      assignedAgent: true,
      tags: { include: { definition: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json(merged);
});
