import { prisma } from "./db/prisma";
import { sendPushToAgent } from "./push";
import type { NotificationType } from "@prisma/client";

export interface CreateNotificationInput {
  agentIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  conversationId?: number;
}

export async function createNotifications(input: CreateNotificationInput): Promise<string[]> {
  const deduped = [...new Set(input.agentIds)];
  if (!deduped.length) return [];

  // Only notify agents who are currently ONLINE
  const onlineAgents = await prisma.agent.findMany({
    where: { id: { in: deduped }, status: "ONLINE" },
    select: { id: true },
  });
  const ids = onlineAgents.map((a) => a.id);
  if (!ids.length) return [];

  const created = await prisma.notification.createManyAndReturn({
    data: ids.map((agentId) => ({
      agentId,
      type: input.type,
      title: input.title,
      body: input.body,
      conversationId: input.conversationId,
    })),
  });

  // Fan out web push (fire-and-forget)
  Promise.allSettled(
    ids.map((agentId) =>
      sendPushToAgent(agentId, {
        title: input.title,
        body: input.body,
        conversationId: input.conversationId != null ? String(input.conversationId) : undefined,
      }).catch((e) => console.error("[push] agent", agentId, e))
    )
  );

  return created.map((n) => n.id);
}
