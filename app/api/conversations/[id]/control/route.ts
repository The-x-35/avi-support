import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { updateConversationControl } from "@/lib/services/conversations";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

const VALID_ACTIONS = new Set(["pause_ai", "resume_ai", "takeover", "resolve", "escalate"]);

// 30 control actions per agent per minute
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export const POST = withTiming("POST /api/conversations/[id]/control", async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const { action } = await request.json();

  if (!VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const conversation = await updateConversationControl(
    parseInt(id),
    action,
    auth.payload.agentId
  );

  return NextResponse.json(conversation);
});
