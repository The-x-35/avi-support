import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { executeSegment } from "@/lib/services/segments";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

// Segment execution runs complex DB queries — limit to 20/min per agent
const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;

  try {
    const result = await executeSegment(id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 }
    );
  }
}
