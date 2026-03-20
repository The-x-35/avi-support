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

const accessSecret = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET ?? "fallback-secret"
);
const refreshSecret = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET ?? "fallback-refresh-secret"
);

export async function signAccessToken(
  payload: Omit<AccessTokenPayload, keyof JWTPayload>
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
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
