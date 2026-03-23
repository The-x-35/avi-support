import { NextRequest, NextResponse } from "next/server";

interface RateLimitOptions {
  /** Max requests allowed within the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Creates a rate limiter with its own isolated store.
 * Call once at module scope, then use .check() per request.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const store = new Map<string, Bucket>();

  function check(key: string): boolean {
    const now = Date.now();
    const bucket = store.get(key);

    if (!bucket || now >= bucket.resetAt) {
      store.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }

    if (bucket.count >= options.limit) return false;

    bucket.count++;
    return true;
  }

  return { check };
}

/** Extract best-effort IP from a Next.js request */
export function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/** Returns a 429 response */
export function tooManyRequests(msg = "Too many requests. Please slow down.") {
  return NextResponse.json({ error: msg }, { status: 429 });
}
