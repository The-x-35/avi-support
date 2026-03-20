import { cookies } from "next/headers";
import { verifyAccessToken, type AccessTokenPayload } from "./jwt";
import { ACCESS_TOKEN_COOKIE } from "./cookies";

export async function getSession(): Promise<AccessTokenPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
    if (!token) return null;
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<AccessTokenPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
