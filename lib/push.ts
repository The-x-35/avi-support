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
  if (!initVapid()) return; // skip if VAPID keys not configured
  const subs = await prisma.pushSubscription.findMany({ where: { agentId } });
  if (!subs.length) return;

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
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        }
      }
    })
  );
}
