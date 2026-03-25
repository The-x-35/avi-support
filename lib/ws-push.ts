/**
 * Push a real-time notification to a specific agent via the WS server's
 * internal HTTP endpoint. Fire-and-forget — silently swallows errors so
 * callers don't need to worry about the WS server being unavailable.
 */
export async function pushNotificationToAgent(
  agentId: string,
  notification: {
    id: string;
    type: string;
    title: string;
    body: string;
    conversationId?: string;
    createdAt: string;
  }
) {
  const base = process.env.WS_INTERNAL_URL ?? "http://localhost:3001";
  const key = process.env.WS_INTERNAL_KEY ?? "";
  try {
    await fetch(`${base}/internal/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "x-internal-key": key } : {}),
      },
      body: JSON.stringify({ agentId, notification }),
    });
  } catch {
    // WS server may not be running in some envs — not fatal
  }
}
