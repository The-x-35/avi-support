import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { getConversations } from "@/lib/services/conversations";
import { prisma } from "@/lib/db/prisma";
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
    category: (searchParams.get("category") ?? undefined) as ConversationFilters["category"], // filters by hasSome
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
    skipCount: searchParams.get("skipCount") === "true",
  };

  const result = await getConversations(filters);
  return NextResponse.json(result);
});

// POST /api/conversations — agent initiates a new conversation with a user by email
export const POST = withTiming("POST /api/conversations", async (request: NextRequest) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
  const VALID_CATEGORIES = new Set(["CARDS", "ACCOUNT", "SPENDS", "KYC", "GENERAL", "OTHER"]);
  const categories = Array.isArray(body.categories)
    ? (body.categories as string[]).filter((c) => VALID_CATEGORIES.has(c))
    : typeof body.category === "string" && VALID_CATEGORIES.has(body.category)
      ? [body.category]
      : [];

  // Find existing end-user by email, or create one
  let endUser = await prisma.endUser.findFirst({ where: { email } });
  if (!endUser) {
    endUser = await prisma.endUser.create({
      data: {
        externalId: `dashboard:${email}`,
        email,
        name,
      },
    });
  } else if (name && !endUser.name) {
    endUser = await prisma.endUser.update({ where: { id: endUser.id }, data: { name } });
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId: endUser.id,
      assignedAgentId: auth.payload.agentId,
      categories: categories as ("CARDS" | "ACCOUNT" | "SPENDS" | "KYC" | "GENERAL" | "OTHER")[],
      isAiPaused: true,
      lastMessageAt: new Date(),
    },
  });

  return NextResponse.json(conversation, { status: 201 });
});
