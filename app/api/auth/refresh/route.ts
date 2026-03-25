import { NextRequest, NextResponse } from "next/server";
import { verifyRefreshToken, signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { getRefreshToken, setAuthCookies, clearAuthCookies } from "@/lib/auth/cookies";
import { prisma } from "@/lib/db/prisma";
import { v4 as uuidv4 } from "uuid";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

// 20 refreshes per IP per minute — generous enough for normal use, blocks hammering
const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

export async function GET(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();

  const { searchParams } = new URL(request.url);
  const rawRedirect = searchParams.get("redirect") ?? "/";
  const redirect = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : "/";

  const refreshToken = getRefreshToken(request);

  if (!refreshToken) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    clearAuthCookies(res);
    return res;
  }

  try {
    const payload = await verifyRefreshToken(refreshToken);

    // Validate against DB
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { agent: true },
    });

    if (
      !storedToken ||
      storedToken.revoked ||
      storedToken.expiresAt < new Date() ||
      !storedToken.agent.isActive
    ) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      clearAuthCookies(res);
      return res;
    }

    // Detect token reuse — revoke all tokens for this agent (theft indicator)
    if (storedToken.id !== payload.tokenId) {
      await prisma.refreshToken.updateMany({
        where: { agentId: storedToken.agentId },
        data: { revoked: true },
      });
      const res = NextResponse.redirect(new URL("/login", request.url));
      clearAuthCookies(res);
      return res;
    }

    // Rotate refresh token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    const newAccessToken = await signAccessToken({
      agentId: storedToken.agent.id,
      email: storedToken.agent.email,
      role: storedToken.agent.role,
    });

    const tokenId = uuidv4();
    const newRefreshToken = await signRefreshToken({
      agentId: storedToken.agent.id,
      tokenId,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        token: newRefreshToken,
        agentId: storedToken.agent.id,
        expiresAt,
      },
    });

    const response = NextResponse.redirect(new URL(redirect, request.url));
    setAuthCookies(response, newAccessToken, newRefreshToken);
    return response;
  } catch {
    const res = NextResponse.redirect(new URL("/login", request.url));
    clearAuthCookies(res);
    return res;
  }
}
