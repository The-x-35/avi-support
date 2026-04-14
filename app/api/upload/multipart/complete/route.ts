import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET, R2_PUBLIC_URL, ALLOWED_MIME_TYPES } from "@/lib/r2";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

// Allow up to 60s for assembling large videos
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!limiter.check(getIP(req))) return tooManyRequests();

  try {
    const { key, uploadId, totalParts, mimeType, fileName } = await req.json() as {
      key: string;
      uploadId: string;
      totalParts: number;
      mimeType: string;
      fileName: string;
    };

    if (!key || !uploadId || !totalParts || !mimeType || !fileName) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (!key.startsWith("chat/")) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    // Download all temp chunks and concatenate
    const chunks: Buffer[] = [];
    for (let i = 1; i <= totalParts; i++) {
      const { Body } = await r2.send(new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: `tmp/${uploadId}/${i}`,
      }));
      chunks.push(Buffer.from(await Body!.transformToByteArray()));
    }

    const assembled = Buffer.concat(chunks);

    // Upload final assembled file
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: assembled,
      ContentType: mimeType,
      ContentLength: assembled.byteLength,
      ACL: "public-read",
    }));

    // Clean up temp objects
    await r2.send(new DeleteObjectsCommand({
      Bucket: R2_BUCKET,
      Delete: {
        Objects: Array.from({ length: totalParts }, (_, i) => ({
          Key: `tmp/${uploadId}/${i + 1}`,
        })),
      },
    }));

    const url = `${R2_PUBLIC_URL}/${key}`;
    const media = await prisma.media.create({
      data: { url, mimeType, fileName },
    });

    return NextResponse.json({ url, mediaId: media.id, mimeType, fileName });
  } catch (err) {
    console.error("[upload/multipart/complete]", err);
    return NextResponse.json({ error: "Failed to complete upload" }, { status: 500 });
  }
}
