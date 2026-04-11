import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { startOfDay, subDays } from "date-fns";

export async function getOverviewStats() {
  const today = startOfDay(new Date());
  const yesterday = startOfDay(subDays(new Date(), 1));

  const [
    totalToday,
    totalYesterday,
    openCount,
    escalatedCount,
    resolvedToday,
    avgResponseTimeResult,
  ] = await Promise.all([
    prisma.conversation.count({ where: { createdAt: { gte: today } } }),
    prisma.conversation.count({
      where: { createdAt: { gte: yesterday, lt: today } },
    }),
    prisma.conversation.count({ where: { status: { in: ["OPEN", "PENDING"] }, lastMessageAt: { not: null } } }),
    prisma.conversation.count({ where: { status: "ESCALATED" } }),
    prisma.conversation.count({
      where: { status: "RESOLVED", updatedAt: { gte: today } },
    }),
    // Avg agent response time: for each user message, find the next AGENT
    // message in the same conversation and compute the time delta.
    // Excludes AI responses entirely — only human agent replies count.
    prisma.$queryRaw<{ avg_seconds: number }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (agent_reply."createdAt" - user_msg."createdAt"))) as avg_seconds
      FROM "Message" user_msg
      JOIN LATERAL (
        SELECT "createdAt"
        FROM "Message"
        WHERE "conversationId" = user_msg."conversationId"
          AND "senderType" = 'AGENT'
          AND "createdAt" > user_msg."createdAt"
        ORDER BY "createdAt" ASC
        LIMIT 1
      ) agent_reply ON true
      WHERE user_msg."senderType" = 'USER'
        AND user_msg."createdAt" >= ${today}
    `,
  ]);

  const avgResponseSeconds = avgResponseTimeResult[0]?.avg_seconds ?? 0;

  return {
    totalToday,
    totalYesterday,
    openCount,
    escalatedCount,
    resolvedToday,
    avgResponseSeconds: Math.round(avgResponseSeconds),
  };
}

export async function getTagDistribution(days = 7, source?: "AGENT" | "AI", dateFrom?: Date, dateTo?: Date) {
  const since = dateFrom ?? startOfDay(subDays(new Date(), days));
  const until = dateTo ?? undefined;

  const tags = await prisma.tag.groupBy({
    by: ["definitionId"],
    where: { createdAt: { gte: since, ...(until ? { lte: until } : {}) }, ...(source ? { source } : {}) },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 50,
  });

  const definitions = await prisma.tagDefinition.findMany({
    where: { id: { in: tags.map((t) => t.definitionId) } },
  });

  const defMap = Object.fromEntries(definitions.map((d) => [d.id, d]));

  return tags.map((t) => ({
    name: defMap[t.definitionId]?.name,
    color: defMap[t.definitionId]?.color,
    count: t._count.id,
  }));
}


export async function getTopIssues(days = 7, source?: "AGENT" | "AI", dateFrom?: Date, dateTo?: Date) {
  const since = dateFrom ?? startOfDay(subDays(new Date(), days));
  const until = dateTo ?? undefined;

  const issues = await prisma.tag.groupBy({
    by: ["definitionId"],
    where: { createdAt: { gte: since, ...(until ? { lte: until } : {}) }, ...(source ? { source } : {}) },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 40,
  });

  const definitions = await prisma.tagDefinition.findMany({
    where: { id: { in: issues.map((i) => i.definitionId) } },
  });

  const defMap = Object.fromEntries(definitions.map((d) => [d.id, d]));

  return issues.map((i) => ({
    name: defMap[i.definitionId]?.name,
    color: defMap[i.definitionId]?.color ?? null,
    count: i._count.id,
  }));
}

export async function getVolumeByDay(days = 30, dateFrom?: Date, dateTo?: Date) {
  const since = dateFrom ?? startOfDay(subDays(new Date(), days));

  const results = await prisma.$queryRaw<
    Array<{ date: string; count: bigint }>
  >`
    SELECT DATE("createdAt") as date, COUNT(*) as count
    FROM "Conversation"
    WHERE "createdAt" >= ${since}
      ${dateTo ? Prisma.sql`AND "createdAt" <= ${dateTo}` : Prisma.empty}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  return results.map((r) => ({
    date: r.date,
    count: Number(r.count),
  }));
}
