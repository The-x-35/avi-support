import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export interface FilterCondition {
  field: string;
  operator: "eq" | "neq" | "in" | "nin" | "gte" | "lte" | "contains";
  value: string | string[] | number | boolean;
}

export interface SegmentFilters {
  conditions: FilterCondition[];
  operator: "AND" | "OR";
}

export function buildWhereFromSegment(
  filters: SegmentFilters
): Prisma.ConversationWhereInput {
  const clauses = filters.conditions
    .map((c) => buildClause(c))
    .filter((c): c is Prisma.ConversationWhereInput => c !== null);

  if (clauses.length === 0) return {};

  return filters.operator === "AND" ? { AND: clauses } : { OR: clauses };
}

function buildClause(
  condition: FilterCondition
): Prisma.ConversationWhereInput | null {
  const { field, operator, value } = condition;

  switch (field) {
    case "status":
      return buildEnumClause("status", operator, value);
    case "category":
      return buildEnumClause("category", operator, value);
    case "priority":
      return buildEnumClause("priority", operator, value);
    case "isAiPaused":
      return { isAiPaused: Boolean(value) };
    case "sentiment":
    case "issue_type":
    case "resolution_status":
    case "product_area":
      return {
        tags: {
          some: {
            definition: {
              type: field,
              value: Array.isArray(value)
                ? { in: value as string[] }
                : String(value),
            },
          },
        },
      };
    case "createdAt":
      if (operator === "gte")
        return { createdAt: { gte: new Date(String(value)) } };
      if (operator === "lte")
        return { createdAt: { lte: new Date(String(value)) } };
      return null;
    default:
      return null;
  }
}

function buildEnumClause(
  field: string,
  operator: FilterCondition["operator"],
  value: FilterCondition["value"]
): Prisma.ConversationWhereInput | null {
  if (operator === "eq") return { [field]: value } as Prisma.ConversationWhereInput;
  if (operator === "neq")
    return { NOT: { [field]: value } } as Prisma.ConversationWhereInput;
  if (operator === "in")
    return {
      [field]: { in: Array.isArray(value) ? value : String(value).split(",") },
    } as Prisma.ConversationWhereInput;
  if (operator === "nin")
    return {
      NOT: {
        [field]: { in: Array.isArray(value) ? value : String(value).split(",") },
      },
    } as Prisma.ConversationWhereInput;
  return null;
}

export async function executeSegment(segmentId: string) {
  const segment = await prisma.segment.findUnique({
    where: { id: segmentId },
  });
  if (!segment) throw new Error("Segment not found");

  const filters = segment.filters as unknown as SegmentFilters;
  const where = buildWhereFromSegment(filters);

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        tags: { include: { definition: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 500,
    }),
    prisma.conversation.count({ where }),
  ]);

  return { conversations, total };
}

export async function exportSegmentCsv(segmentId: string): Promise<string> {
  const { conversations } = await executeSegment(segmentId);

  const rows = [
    [
      "ID",
      "User Name",
      "User Email",
      "Category",
      "Status",
      "Priority",
      "AI Paused",
      "Issue Type",
      "Sentiment",
      "Created At",
      "Last Message At",
    ].join(","),
    ...conversations.map((c) => {
      const tagMap = Object.fromEntries(
        c.tags.map((t) => [t.definition.type, t.definition.value])
      );
      return [
        c.id,
        `"${c.user.name ?? ""}"`,
        `"${c.user.email ?? ""}"`,
        c.category,
        c.status,
        c.priority,
        c.isAiPaused,
        tagMap.issue_type ?? "",
        tagMap.sentiment ?? "",
        c.createdAt.toISOString(),
        c.lastMessageAt?.toISOString() ?? "",
      ].join(",");
    }),
  ];

  return rows.join("\n");
}
