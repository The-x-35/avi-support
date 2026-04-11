import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import {
  r2, R2_BUCKET, R2_PUBLIC_URL,
  ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS,
  MAX_IMAGE_BYTES, MAX_VIDEO_BYTES,
} from "@/lib/r2";
import { prisma } from "@/lib/db/prisma";
import { getChatSessionFromRequest } from "@/lib/auth/chat-token";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";

// ─── In-memory rate limiter ───────────────────────────────────────────────────
// 10 presign requests per IP per 60 seconds
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

    // Verify auth — accept either chat widget session OR admin/agent token
    const chatSession = await getChatSessionFromRequest(req);
    let isAgent = false;

    if (!chatSession) {
      const accessToken = getAccessToken(req);
      if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      try {
        await verifyAccessToken(accessToken);
        isAgent = true;
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { fileName, mimeType, fileSize, conversationId } = await req.json();

    const conversationIdInt = parseInt(conversationId, 10);
    if (!fileName || !mimeType || typeof fileSize !== "number" || !conversationId || isNaN(conversationIdInt)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify conversation exists and is active
    // For chat widget users, also verify ownership
    let conversation;
    if (isAgent) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationIdInt },
        select: { id: true, status: true },
      });
    } else {
      const endUser = await prisma.endUser.findUnique({ where: { externalId: chatSession!.userId }, select: { id: true } });
      conversation = endUser
        ? await prisma.conversation.findUnique({
            where: { id: conversationIdInt, userId: endUser.id },
            select: { id: true, status: true },
          })
        : null;
    }

    if (!conversation) {
      return NextResponse.json({ error: "Invalid conversation" }, { status: 403 });
    }

    if (conversation.status === "CLOSED" || conversation.status === "RESOLVED") {
      return NextResponse.json(
        { error: "Cannot upload to a closed conversation" },
        { status: 403 }
      );
    }

    // Validate extension
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `File type .${ext} is not allowed. Only images and videos are accepted.` },
        { status: 400 }
      );
    }

    // Validate MIME type (double-check, client can lie about extension)
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: "Invalid file type. Only images and videos are accepted." },
        { status: 400 }
      );
    }

    const isVideo = mimeType.startsWith("video/");
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

    if (fileSize > maxBytes) {
      const limitMB = maxBytes / 1024 / 1024;
      return NextResponse.json(
        { error: `${isVideo ? "Video" : "Image"} too large. Max size is ${limitMB}MB.` },
        { status: 400 }
      );
    }

    // Generate a unique, unguessable key scoped to the conversation
    const key = `chat/${conversationId}/${randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: mimeType,
      ContentLength: fileSize,
    });

    // Presigned URL valid for 15 minutes
    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 900 });
    const publicUrl = `${R2_PUBLIC_URL}/${key}`;

    return NextResponse.json({ uploadUrl, publicUrl, key });
  } catch (err) {
    console.error("[upload/presign]", err);
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
