import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/auth/google";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirect = searchParams.get("redirect") ?? "/";

  const url = getGoogleAuthUrl(redirect);
  return NextResponse.redirect(url);
}
