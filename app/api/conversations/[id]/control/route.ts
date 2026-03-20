import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { updateConversationControl } from "@/lib/services/conversations";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { action } = await request.json();

  const validActions = ["pause_ai", "resume_ai", "takeover", "resolve", "escalate"];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const conversation = await updateConversationControl(
    id,
    action,
    auth.payload.agentId
  );

  return NextResponse.json(conversation);
}
