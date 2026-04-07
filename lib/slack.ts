const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
}

export async function sendSlackMessage(message: SlackMessage): Promise<void> {
  if (!WEBHOOK_URL) {
    throw new Error("SLACK_WEBHOOK_URL is not configured");
  }

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook failed: ${res.status} ${body}`);
  }
}
