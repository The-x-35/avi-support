import { NextResponse, type NextRequest } from "next/server";
import { getAccessToken, getRefreshToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";

const PUBLIC_PATHS = [
  "/login",
  "/chat",
  "/api/auth/google",
  "/api/auth/callback",
  "/api/auth/refresh",
  "/api/chat",
  "/api/upload",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
