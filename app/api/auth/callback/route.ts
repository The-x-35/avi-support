import { NextResponse } from "next/server";
import { exchangeGoogleCode, getGoogleUserInfo } from "@/lib/auth/google";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { setAuthCookies } from "@/lib/auth/cookies";
import { prisma } from "@/lib/db/prisma";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // the redirect path
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/login?error=${error ?? "no_code"}`, request.url)
    );
  }

  try {
    const { access_token } = await exchangeGoogleCode(code);
    const googleUser = await getGoogleUserInfo(access_token);

    if (!googleUser.verified_email) {
      return NextResponse.redirect(
        new URL("/login?error=unverified_email", request.url)
      );
    }

    // Enforce @avici.club domain
    if (!googleUser.email.endsWith("@avici.club")) {
      return NextResponse.redirect(
        new URL("/login?error=unauthorized_domain", request.url)
      );
    }

    // Upsert agent by Google ID
    const agent = await prisma.agent.upsert({
      where: { googleId: googleUser.id },
      create: {
        googleId: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.picture,
        role: "AGENT",
      },
      update: {
        name: googleUser.name,
        avatarUrl: googleUser.picture,
        email: googleUser.email,
      },
    });

    if (!agent.isActive) {
      return NextResponse.redirect(
        new URL("/login?error=account_disabled", request.url)
      );
    }

    // Issue tokens
    const accessToken = await signAccessToken({
      agentId: agent.id,
      email: agent.email,
      role: agent.role,
    });

    const tokenId = uuidv4();
    const refreshToken = await signRefreshToken({
      agentId: agent.id,
      tokenId,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        token: refreshToken,
        agentId: agent.id,
        expiresAt,
      },
    });

    const redirectPath = state ?? "/";
    const response = NextResponse.redirect(
      new URL(redirectPath, request.url)
    );

    setAuthCookies(response, accessToken, refreshToken);
    return response;
  } catch (err) {
    console.error("[auth/callback]", err);
    return NextResponse.redirect(
      new URL("/login?error=auth_failed", request.url)
    );
  }
}
