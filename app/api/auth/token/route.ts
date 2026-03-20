import { type NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";

// Returns the access token value so client-side WS can use it for auth.
// The token itself is short-lived (15m) so this is acceptable.
export async function GET(request: NextRequest) {
  const token = getAccessToken(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ token });
}
