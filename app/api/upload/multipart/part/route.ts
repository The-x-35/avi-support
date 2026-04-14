import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET } from "@/lib/r2";
import { createRateLimiter, getIP, tooManyRequests } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 100, windowMs: 60_000 });

export async function POST(req: NextRequest) {
  if (!limiter.check(getIP(req))) return tooManyRequests();

  try {
    const formData = await req.formData();
    const chunk = formData.get("chunk") as File | null;
    const key = formData.get("key") as string | null;
    const uploadId = formData.get("uploadId") as string | null;
    const partNumber = parseInt(formData.get("partNumber") as string, 10);

    if (!chunk || !key || !uploadId || isNaN(partNumber)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (!key.startsWith("chat/")) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }

    const buffer = Buffer.from(await chunk.arrayBuffer());

    // Store as a temp object — assembled in the complete step
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: `tmp/${uploadId}/${partNumber}`,
      Body: buffer,
      ContentLength: buffer.byteLength,
    }));

    return NextResponse.json({ partNumber });
  } catch (err) {
    console.error("[upload/multipart/part]", err);
    return NextResponse.json({ error: "Failed to upload part" }, { status: 500 });
  }
}
