import { NextResponse, type NextRequest } from "next/server";
import { getAccessToken, getRefreshToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { jwtVerify } from "jose";
import { CHAT_SESSION_COOKIE, CHAT_TOKEN_EXPIRY_SECONDS } from "@/lib/auth/chat-token";

function getChatSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.CHAT_TOKEN_SECRET ?? "");
}

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/google",
  "/api/auth/callback",
  "/api/auth/refresh",
  "/api/chat",
  "/api/upload",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

async function handleChatAuth(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/chat")) return null;
  if (pathname === "/chat/error") return NextResponse.next();

  const token = request.nextUrl.searchParams.get("token");
  const sessionCookie = request.cookies.get(CHAT_SESSION_COOKIE)?.value;

  if (token) {
    try {
      await jwtVerify(token, getChatSecret());
      const url = request.nextUrl.clone();
      url.searchParams.delete("token");
      const response = NextResponse.redirect(url);
      response.cookies.set(CHAT_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: CHAT_TOKEN_EXPIRY_SECONDS,
        path: "/",
      });
      return response;
    } catch {
      return NextResponse.redirect(new URL("/chat/error", request.url));
    }
  }

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/chat/error", request.url));
  }

  try {
    await jwtVerify(sessionCookie, getChatSecret());
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL("/chat/error", request.url));
    response.cookies.delete(CHAT_SESSION_COOKIE);
    return response;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Chat widget auth (JWT token → session cookie)
  const chatResponse = await handleChatAuth(request);
  if (chatResponse) return chatResponse;

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Allow static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const accessToken = getAccessToken(request);

  if (accessToken) {
    try {
      await verifyAccessToken(accessToken);
      return NextResponse.next();
    } catch {
      // Access token invalid/expired — try refresh
    }
  }

  const refreshToken = getRefreshToken(request);
  if (refreshToken) {
    // Redirect to refresh endpoint, then back
    const refreshUrl = new URL("/api/auth/refresh", request.url);
    refreshUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(refreshUrl);
  }

  // No valid tokens — redirect to login
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
