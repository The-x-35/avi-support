import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const CHAT_SESSION_COOKIE = "chat_session";
export const CHAT_TOKEN_EXPIRY_SECONDS = 8 * 60 * 60; // 8 hours

export interface ChatSession {
  userId: string; // externalId (email)
}

function getChatSecret(): Uint8Array {
  const secret = process.env.CHAT_TOKEN_SECRET;
  if (!secret) throw new Error("CHAT_TOKEN_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function verifyChatToken(token: string): Promise<ChatSession | null> {
  try {
    const { payload } = await jwtVerify(token, getChatSecret());
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

/** For server pages — reads from next/headers cookies */
export async function getChatSession(): Promise<ChatSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(CHAT_SESSION_COOKIE)?.value;
    if (!token) return null;
    return await verifyChatToken(token);
  } catch {
    return null;
  }
}

/** Returns the raw JWT string from the cookie (for passing to WS auth) */
export async function getChatToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(CHAT_SESSION_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/** For API route handlers — reads from the request object */
export async function getChatSessionFromRequest(req: NextRequest): Promise<ChatSession | null> {
  const token = req.cookies.get(CHAT_SESSION_COOKIE)?.value;
  if (!token) return null;
  return await verifyChatToken(token);
}
