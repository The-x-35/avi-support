import { prisma } from "./db/prisma";
import { sendPushToAgent } from "./push";
import type { NotificationType } from "@prisma/client";

export interface CreateNotificationInput {
  agentIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  conversationId?: string;
}

export async function createNotifications(input: CreateNotificationInput): Promise<string[]> {
  const ids = [...new Set(input.agentIds)];
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
        conversationId: input.conversationId,
      }).catch((e) => console.error("[push] agent", agentId, e))
    )
  );

  return created.map((n) => n.id);
}
