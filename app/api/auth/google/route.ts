import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/auth/google";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

// 10 OAuth initiations per IP per minute
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export function GET(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();

  const { searchParams } = new URL(request.url);
  const rawRedirect = searchParams.get("redirect") ?? "/";
  const redirect = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : "/";

  const url = getGoogleAuthUrl(redirect);
  return NextResponse.redirect(url);
}
