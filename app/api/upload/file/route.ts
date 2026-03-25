import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import {
  r2, R2_BUCKET, R2_PUBLIC_URL,
  ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS,
  MAX_IMAGE_BYTES, MAX_VIDEO_BYTES,
} from "@/lib/r2";
import { prisma } from "@/lib/db/prisma";

// ─── Rate limiter ─────────────────────────────────────────────────────────────
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now >= entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many upload requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const rawConvId = formData.get("conversationId") as string | null;
    const conversationId = rawConvId ? parseInt(rawConvId) : NaN;

    if (!file || isNaN(conversationId)) {
      return NextResponse.json({ error: "Missing file or conversationId" }, { status: 400 });
    }

    // Verify conversation exists and is active
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, status: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Invalid conversation" }, { status: 403 });
    }

    if (conversation.status === "CLOSED" || conversation.status === "RESOLVED") {
      return NextResponse.json({ error: "Cannot upload to a closed conversation" }, { status: 403 });
    }

    // Validate extension
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `File type .${ext} is not allowed.` },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only images and videos are accepted." },
        { status: 400 }
      );
    }

    const isVideo = file.type.startsWith("video/");
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

    if (file.size > maxBytes) {
      const limitMB = maxBytes / 1024 / 1024;
      return NextResponse.json(
        { error: `${isVideo ? "Video" : "Image"} too large. Max ${limitMB}MB.` },
        { status: 400 }
      );
    }

    const key = `chat/${rawConvId}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      ContentLength: buffer.byteLength,
    }));

    const url = `${R2_PUBLIC_URL}/${key}`;
    const media = await prisma.media.create({
      data: { url, mimeType: file.type, fileName: file.name },
    });

    return NextResponse.json({ url, mediaId: media.id, mimeType: file.type, fileName: file.name });
  } catch (err) {
    console.error("[upload/file]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
