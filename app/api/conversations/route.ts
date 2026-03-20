import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { getConversations } from "@/lib/services/conversations";
import type { ConversationStatus, Category, Priority } from "@prisma/client";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);

  const filters = {
    status: searchParams.get("status") as ConversationStatus | null ?? undefined,
    category: searchParams.get("category") as Category | null ?? undefined,
    priority: searchParams.get("priority") as Priority | null ?? undefined,
    isAiPaused: searchParams.has("isAiPaused")
      ? searchParams.get("isAiPaused") === "true"
      : undefined,
    assignedAgentId: searchParams.get("assignedAgentId") ?? undefined,
    userId: searchParams.get("userId") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    tagType: searchParams.get("tagType") ?? undefined,
    tagValue: searchParams.get("tagValue") ?? undefined,
    dateFrom: searchParams.get("dateFrom")
      ? new Date(searchParams.get("dateFrom")!)
      : undefined,
    dateTo: searchParams.get("dateTo")
      ? new Date(searchParams.get("dateTo")!)
      : undefined,
    page: searchParams.get("page") ? parseInt(searchParams.get("page")!) : 1,
    limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50,
  };

  const result = await getConversations(filters);
  return NextResponse.json(result);
}
