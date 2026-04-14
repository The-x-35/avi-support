import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS,
  MAX_VIDEO_BYTES,
} from "@/lib/r2";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";
import { getChatSessionFromRequest } from "@/lib/auth/chat-token";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export async function POST(req: NextRequest) {
  if (!limiter.check(getIP(req))) return tooManyRequests();

  try {
    // Auth — accept chat widget session OR agent token
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

    if (!fileName || !mimeType || typeof fileSize !== "number" || isNaN(conversationIdInt)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `File type .${ext} is not allowed.` }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: "Invalid file type." }, { status: 400 });
    }

    if (fileSize > MAX_VIDEO_BYTES) {
      return NextResponse.json({ error: `File too large. Max ${MAX_VIDEO_BYTES / 1024 / 1024}MB.` }, { status: 400 });
    }

    // Verify conversation
    let conversation;
    if (isAgent) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationIdInt },
        select: { id: true, status: true },
      });
    } else {
      const endUser = await prisma.endUser.findUnique({
        where: { externalId: chatSession!.userId },
        select: { id: true },
      });
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
      return NextResponse.json({ error: "Cannot upload to a closed conversation" }, { status: 403 });
    }

    // Generate IDs — no S3 call needed, chunks stored as temp objects
    const uploadId = randomUUID();
    const key = `chat/${conversationId}/${randomUUID()}.${ext}`;

    return NextResponse.json({ uploadId, key });
  } catch (err) {
    console.error("[upload/multipart/init]", err);
    return NextResponse.json({ error: "Failed to init upload" }, { status: 500 });
  }
}
