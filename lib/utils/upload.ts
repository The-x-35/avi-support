export interface UploadedMedia {
  url: string;
  mediaId: string;
  mimeType: string;
  fileName: string;
}

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB — under Vercel's 4.5 MB body limit
const SINGLE_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4 MB — use single upload below this

/**
 * Upload a file and return media metadata + mediaId.
 *
 * Small files (<4.5MB)  → POST /api/upload/file  (single request)
 * Large files (>=4.5MB) → chunked multipart upload via /api/upload/multipart/*
 */
export async function uploadMedia(file: File, conversationId: string): Promise<UploadedMedia> {
  if (file.size < SINGLE_UPLOAD_LIMIT) {
    return uploadSingle(file, conversationId);
  }

  return uploadChunked(file, conversationId);
}

async function uploadSingle(file: File, conversationId: string): Promise<UploadedMedia> {
  const form = new FormData();
  form.append("file", file);
  form.append("conversationId", conversationId);

  const res = await fetch("/api/upload/file", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Upload failed (${res.status})`);
  }
  return res.json();
}

async function uploadChunked(file: File, conversationId: string): Promise<UploadedMedia> {
  // Step 1: init multipart upload
  const initRes = await fetch("/api/upload/multipart/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      conversationId,
    }),
  });

  if (!initRes.ok) {
    const body = await initRes.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to init upload");
  }

  const { uploadId, key } = await initRes.json() as { uploadId: string; key: string };

  // Step 2: upload chunks sequentially as temp S3 objects
  const totalParts = Math.ceil(file.size / CHUNK_SIZE);

  for (let i = 0; i < totalParts; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const partNumber = i + 1;

    const form = new FormData();
    form.append("chunk", chunk);
    form.append("key", key);
    form.append("uploadId", uploadId);
    form.append("partNumber", String(partNumber));

    const partRes = await fetch("/api/upload/multipart/part", {
      method: "POST",
      body: form,
    });

    if (!partRes.ok) {
      const body = await partRes.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `Chunk ${partNumber}/${totalParts} failed`);
    }
  }

  // Step 3: server assembles temp objects into final file + creates Media record
  const completeRes = await fetch("/api/upload/multipart/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, uploadId, totalParts, mimeType: file.type, fileName: file.name }),
  });

  if (!completeRes.ok) {
    const body = await completeRes.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to complete upload");
  }

  return completeRes.json();
}
