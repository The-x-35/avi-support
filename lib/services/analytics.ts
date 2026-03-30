import { prisma } from "@/lib/db/prisma";
import { startOfDay, subDays, eachDayOfInterval } from "date-fns";

export async function getOverviewStats() {
  const today = startOfDay(new Date());
  const yesterday = startOfDay(subDays(new Date(), 1));

  const [
    totalToday,
    totalYesterday,
    openCount,
    escalatedCount,
    resolvedToday,
    aiResolvedToday,
    avgResponseTimeResult,
  ] = await Promise.all([
    prisma.conversation.count({ where: { createdAt: { gte: today } } }),
    prisma.conversation.count({
      where: { createdAt: { gte: yesterday, lt: today } },
    }),
    prisma.conversation.count({ where: { status: { in: ["OPEN", "PENDING"] } } }),
    prisma.conversation.count({ where: { status: "ESCALATED" } }),
    prisma.conversation.count({
      where: { status: "RESOLVED", updatedAt: { gte: today } },
    }),
    prisma.conversation.count({
      where: {
        status: "RESOLVED",
        updatedAt: { gte: today },
        tags: {
          some: {
            definition: { name: "Resolved by AI" },
          },
        },
      },
    }),
    // Avg response time: avg time between first user message and first AI/agent message
    prisma.$queryRaw<{ avg_seconds: number }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (second_msg."createdAt" - first_msg."createdAt"))) as avg_seconds
      FROM (
        SELECT DISTINCT ON ("conversationId") "conversationId", "createdAt"
        FROM "Message"
        WHERE "senderType" = 'USER'
        ORDER BY "conversationId", "createdAt" ASC
      ) first_msg
      JOIN (
        SELECT DISTINCT ON ("conversationId") "conversationId", "createdAt"
        FROM "Message"
        WHERE "senderType" IN ('AI', 'AGENT')
        ORDER BY "conversationId", "createdAt" ASC
      ) second_msg ON first_msg."conversationId" = second_msg."conversationId"
      WHERE first_msg."createdAt" >= ${today}
    `,
  ]);

  const aiResolutionRate =
    resolvedToday > 0
      ? Math.round((aiResolvedToday / resolvedToday) * 100)
      : 0;

  const avgResponseSeconds = avgResponseTimeResult[0]?.avg_seconds ?? 0;

  return {
    totalToday,
    totalYesterday,
    openCount,
    escalatedCount,
    resolvedToday,
    aiResolvedToday,
    aiResolutionRate,
    avgResponseSeconds: Math.round(avgResponseSeconds),
  };
}

export async function getTagDistribution(days = 7, source?: "AGENT" | "AI") {
  const since = startOfDay(subDays(new Date(), days));

  const tags = await prisma.tag.groupBy({
    by: ["definitionId"],
    where: { createdAt: { gte: since }, ...(source ? { source } : {}) },
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

export async function getSentimentTrend(days = 14) {
  const since = startOfDay(subDays(new Date(), days));
  const interval = eachDayOfInterval({ start: since, end: new Date() });

  const sentimentNames = ["Positive", "Neutral", "Frustrated", "Angry"];

  // Use raw SQL aggregation instead of loading every tag row
  const rows = await prisma.$queryRaw<
    Array<{ date: string; name: string; count: bigint }>
  >`
    SELECT DATE(t."createdAt") as date, td."name", COUNT(*) as count
    FROM "Tag" t
    JOIN "TagDefinition" td ON t."definitionId" = td."id"
    WHERE t."createdAt" >= ${since}
      AND td."name" = ANY(${sentimentNames})
    GROUP BY DATE(t."createdAt"), td."name"
    ORDER BY date ASC
  `;

  const byDay = new Map<
    string,
    { positive: number; neutral: number; frustrated: number; angry: number }
  >();

  for (const day of interval) {
    byDay.set(day.toISOString().split("T")[0], {
      positive: 0, neutral: 0, frustrated: 0, angry: 0,
    });
  }

  for (const row of rows) {
    const dateStr = typeof row.date === "string" ? row.date : new Date(row.date).toISOString().split("T")[0];
    const bucket = byDay.get(dateStr);
    if (bucket) {
      const val = row.name.toLowerCase() as keyof typeof bucket;
      if (val in bucket) bucket[val] += Number(row.count);
    }
  }

  return Array.from(byDay.entries()).map(([date, counts]) => ({ date, ...counts }));
}

export async function getTopIssues(days = 7, source?: "AGENT" | "AI") {
  const since = startOfDay(subDays(new Date(), days));

  const issues = await prisma.tag.groupBy({
    by: ["definitionId"],
    where: { createdAt: { gte: since }, ...(source ? { source } : {}) },
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

export async function getVolumeByDay(days = 30) {
  const since = startOfDay(subDays(new Date(), days));

  const results = await prisma.$queryRaw<
    Array<{ date: string; count: bigint }>
  >`
    SELECT DATE("createdAt") as date, COUNT(*) as count
    FROM "Conversation"
    WHERE "createdAt" >= ${since}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  return results.map((r) => ({
    date: r.date,
    count: Number(r.count),
  }));
}
