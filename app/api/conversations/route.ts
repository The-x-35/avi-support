import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { getConversations } from "@/lib/services/conversations";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

type ConversationFilters = NonNullable<Parameters<typeof getConversations>[0]>;

// 120 requests per agent per minute
const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

export const GET = withTiming("GET /api/conversations", async (request: NextRequest) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { searchParams } = new URL(request.url);

  const rawLimit = parseInt(searchParams.get("limit") ?? "50");
  const limit = Math.min(Math.max(1, rawLimit), 100); // clamp 1–100

  const filters = {
    status: (searchParams.get("status") ?? undefined) as ConversationFilters["status"],
    category: (searchParams.get("category") ?? undefined) as ConversationFilters["category"],
    priority: (searchParams.get("priority") ?? undefined) as ConversationFilters["priority"],
    isAiPaused: searchParams.has("isAiPaused")
      ? searchParams.get("isAiPaused") === "true"
      : undefined,
    assignedAgentId: searchParams.has("assignedAgentId")
      ? (searchParams.get("assignedAgentId") === "null" ? null : searchParams.get("assignedAgentId")!)
      : undefined,
    userId: searchParams.get("userId") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    tagName: searchParams.get("tagName") ?? undefined,
    dateFrom: searchParams.get("dateFrom")
      ? new Date(searchParams.get("dateFrom")!)
      : undefined,
    dateTo: searchParams.get("dateTo")
      ? new Date(searchParams.get("dateTo")!)
      : undefined,
    page: searchParams.get("page") ? parseInt(searchParams.get("page")!) : 1,
    limit,
  };

  const result = await getConversations(filters);
  return NextResponse.json(result);
});
