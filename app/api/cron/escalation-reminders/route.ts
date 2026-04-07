import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sendSlackMessage } from "@/lib/slack";

// Vercel sets CRON_SECRET and sends it as "Authorization: Bearer <secret>"
// on every cron invocation. We reject anything else.
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function formatTimeLeft(due: Date): string {
  const ms = due.getTime() - Date.now();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamName = process.env.ESCALATION_TEAM_NAME ?? "dev";
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const escalations = await prisma.escalation.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      dueDate: { gte: now, lte: in48h },
      team: { name: { equals: teamName, mode: "insensitive" } },
    },
    orderBy: { dueDate: "asc" },
    include: {
      team: { select: { name: true } },
      conversation: {
        select: {
          id: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (escalations.length === 0) {
    return NextResponse.json({ sent: false, reason: "no escalations due soon" });
  }

  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  const listItems = escalations.map((e) => {
    const due = e.dueDate!;
    const timeLeft = formatTimeLeft(due);
    const dueStr = due.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
    const customer = e.conversation.user.name ?? e.conversation.user.email;
    const link = `${appUrl}/conversations/${e.conversation.id}`;
    const cats = e.categories.length ? ` · ${e.categories.join(", ")}` : "";
    return `• *<${link}|${e.title}>* — due in *${timeLeft}* (${dueStr})${cats}\n  Customer: ${customer} · Status: ${e.status.replace("_", " ")}`;
  });

  const plural = escalations.length === 1 ? "escalation" : "escalations";

  await sendSlackMessage({
    text: `:rotating_light: ${escalations.length} ${plural} due in the next 48 hours`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `:rotating_light: ${escalations.length} ${plural} due in the next 48 hours`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Team: *${teamName}*\n\n${listItems.join("\n\n")}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${appUrl}/escalations|View all escalations>`,
          },
        ],
      },
    ],
  });

  return NextResponse.json({ sent: true, count: escalations.length });
}
