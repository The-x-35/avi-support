import webpush from "web-push";
import { prisma } from "./db/prisma";

function initVapid() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:support@avici.club",
    pub,
    priv
  );
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  conversationId?: string;
  url?: string;
}

export async function sendPushToAgent(agentId: string, payload: PushPayload) {
  if (!initVapid()) {
    console.warn("[push] VAPID keys not configured — skipping push");
    return;
  }
  const subs = await prisma.pushSubscription.findMany({ where: { agentId } });
  if (!subs.length) {
    console.warn("[push] no subscriptions for agent", agentId);
    return;
  }
  await deliverToSubs(subs, payload);
}

/**
 * Batch variant — fetches all subscriptions for all agents in ONE query
 * instead of N separate findMany calls. Use this when notifying multiple agents.
 */
export async function sendPushBatch(agentIds: string[], payload: PushPayload) {
  if (!initVapid() || !agentIds.length) return;

  const allSubs = await prisma.pushSubscription.findMany({
    where: { agentId: { in: agentIds } },
  });
  if (!allSubs.length) return;

  await deliverToSubs(allSubs, payload);
}

async function deliverToSubs(
  subs: Array<{ endpoint: string; p256dh: string; auth: string }>,
  payload: PushPayload
) {
  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: "/favicon.ico",
    data: {
      url: payload.url ?? (payload.conversationId ? `/conversations/${payload.conversationId}` : "/"),
      conversationId: payload.conversationId,
    },
  });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data
        );
        console.log("[push] sent to", sub.endpoint.slice(0, 60));
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        console.error("[push] failed", status, (err as Error).message);
        if (status === 410 || status === 404) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        }
      }
    })
  );
}
