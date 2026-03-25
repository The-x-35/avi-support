import { NextResponse, type NextRequest } from "next/server";
import { getRefreshToken, clearAuthCookies } from "@/lib/auth/cookies";
import { verifyRefreshToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export async function POST(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();
  const refreshToken = getRefreshToken(request);

  if (refreshToken) {
    try {
      await verifyRefreshToken(refreshToken);
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { revoked: true },
      });
    } catch {
      // Token already invalid — still clear cookies
    }
  }

  const response = NextResponse.json({ success: true });
  clearAuthCookies(response);
  return response;
}
