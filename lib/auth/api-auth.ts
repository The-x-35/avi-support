import { type NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "./cookies";
import { verifyAccessToken, type AccessTokenPayload } from "./jwt";

export async function authenticateRequest(
  request: NextRequest
): Promise<{ payload: AccessTokenPayload } | { error: NextResponse }> {
  const token = getAccessToken(request);

  if (!token) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const payload = await verifyAccessToken(token);
    return { payload };
  } catch {
    return {
      error: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    };
  }
}

export function requireRole(
  payload: AccessTokenPayload,
  role: "ADMIN" | "AGENT"
): NextResponse | null {
  if (role === "ADMIN" && payload.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
