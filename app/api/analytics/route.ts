import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  getOverviewStats,
  getTagDistribution,
  getSentimentTrend,
  getTopIssues,
  getVolumeByDay,
} from "@/lib/services/analytics";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { withTiming } from "@/lib/perf";

// Analytics queries are expensive — 20 per agent per minute
const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

const VALID_TYPES = new Set(["overview", "tag_distribution", "sentiment_trend", "top_issues", "volume"]);

export const GET = withTiming("GET /api/analytics", async (request: NextRequest) => {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "overview";

  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "Unknown analytics type" }, { status: 400 });
  }

  const rawDays = parseInt(searchParams.get("days") ?? "7");
  const days = Math.min(Math.max(1, rawDays), 90); // clamp 1–90 days

  switch (type) {
    case "overview":          return NextResponse.json(await getOverviewStats());
    case "tag_distribution":  return NextResponse.json(await getTagDistribution(days));
    case "sentiment_trend":   return NextResponse.json(await getSentimentTrend(days));
    case "top_issues":        return NextResponse.json(await getTopIssues(days));
    case "volume":            return NextResponse.json(await getVolumeByDay(days));
    default:                  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  }
});
