import { type NextRequest, NextResponse } from "next/server";
import { getAccessToken, getRefreshToken, setAuthCookies } from "@/lib/auth/cookies";
import { verifyAccessToken, verifyRefreshToken, signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db/prisma";
import { v4 as uuidv4 } from "uuid";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(request: NextRequest) {
  if (!limiter.check(getIP(request))) return tooManyRequests();
  const accessToken = getAccessToken(request);

  // Happy path — token exists and is still valid
  if (accessToken) {
    try {
      await verifyAccessToken(accessToken);
      return NextResponse.json({ token: accessToken });
    } catch {
      // Expired — fall through to refresh
    }
  }

  // Try to refresh using the refresh token
  const refreshToken = getRefreshToken(request);
  if (!refreshToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await verifyRefreshToken(refreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { agent: true },
    });

    if (
      !storedToken ||
      storedToken.revoked ||
      storedToken.expiresAt < new Date() ||
      !storedToken.agent.isActive ||
      storedToken.id !== payload.tokenId
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rotate tokens
    await prisma.refreshToken.update({ where: { id: storedToken.id }, data: { revoked: true } });

    const newAccessToken = await signAccessToken({
      agentId: storedToken.agent.id,
      email: storedToken.agent.email,
      role: storedToken.agent.role,
    });

    const tokenId = uuidv4();
    const newRefreshToken = await signRefreshToken({ agentId: storedToken.agent.id, tokenId });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: { id: tokenId, token: newRefreshToken, agentId: storedToken.agent.id, expiresAt },
    });

    const response = NextResponse.json({ token: newAccessToken });
    setAuthCookies(response, newAccessToken, newRefreshToken);
    return response;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
