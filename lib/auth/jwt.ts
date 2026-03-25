import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface AccessTokenPayload extends JWTPayload {
  agentId: string;
  email: string;
  role: "ADMIN" | "AGENT";
}

export interface RefreshTokenPayload extends JWTPayload {
  agentId: string;
  tokenId: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const accessSecret = new TextEncoder().encode(requireEnv("JWT_ACCESS_SECRET"));
const refreshSecret = new TextEncoder().encode(requireEnv("JWT_REFRESH_SECRET"));

export async function signAccessToken(
  payload: Omit<AccessTokenPayload, keyof JWTPayload>
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(accessSecret);
}

export async function signRefreshToken(
  payload: Omit<RefreshTokenPayload, keyof JWTPayload>
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(refreshSecret);
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret);
  return payload as AccessTokenPayload;
}

export async function verifyRefreshToken(
  token: string
): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, refreshSecret);
  return payload as RefreshTokenPayload;
}
