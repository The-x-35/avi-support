import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { R2_PUBLIC_URL, ALLOWED_MIME_TYPES } from "@/lib/r2";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

export async function POST(req: NextRequest) {
  if (!limiter.check(getIP(req))) return tooManyRequests();
  try {
    const { key, mimeType, fileName } = await req.json();

    if (!key || !mimeType || !fileName) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // key must be scoped to chat/ to prevent arbitrary record creation
    if (!key.startsWith("chat/")) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    const url = `${R2_PUBLIC_URL}/${key}`;
    const media = await prisma.media.create({
      data: { url, mimeType, fileName },
    });

    return NextResponse.json({ mediaId: media.id, url, mimeType, fileName });
  } catch (err) {
    console.error("[upload/confirm]", err);
    return NextResponse.json({ error: "Failed to register upload" }, { status: 500 });
  }
}
