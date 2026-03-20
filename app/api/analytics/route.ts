import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  getOverviewStats,
  getTagDistribution,
  getSentimentTrend,
  getTopIssues,
  getVolumeByDay,
} from "@/lib/services/analytics";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "overview";
  const days = parseInt(searchParams.get("days") ?? "7");

  switch (type) {
    case "overview":
      return NextResponse.json(await getOverviewStats());
    case "tag_distribution":
      return NextResponse.json(await getTagDistribution(days));
    case "sentiment_trend":
      return NextResponse.json(await getSentimentTrend(days));
    case "top_issues":
      return NextResponse.json(await getTopIssues(days));
    case "volume":
      return NextResponse.json(await getVolumeByDay(days));
    default:
      return NextResponse.json({ error: "Unknown analytics type" }, { status: 400 });
  }
}
