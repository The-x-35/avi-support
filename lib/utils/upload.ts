export interface UploadedMedia {
  url: string;
  mediaId: string;
  mimeType: string;
  fileName: string;
}

/**
 * Upload a file and return media metadata + mediaId.
 *
 * Images  → POST /api/upload/file  (compressed to <2MB, safe under Vercel's 4.5MB limit)
 * Videos  → presign → PUT directly to R2 → POST /api/upload/confirm
 *           (bypasses Vercel entirely, no size limit from the server side)
 */
export async function uploadMedia(file: File, conversationId: string): Promise<UploadedMedia> {
  const isVideo = file.type.startsWith("video/");

  if (!isVideo) {
    // ── Images: go through the Next.js route ──────────────────────────────────
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

  // ── Videos: presigned URL → direct PUT to R2 ─────────────────────────────

  // Step 1: get a presigned PUT URL from the server
  const presignRes = await fetch("/api/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      conversationId,
    }),
  });

  if (!presignRes.ok) {
    const body = await presignRes.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to get upload URL");
  }

  const { uploadUrl, key } = await presignRes.json() as { uploadUrl: string; key: string };

  // Step 2: PUT the file directly to R2 (no Vercel in the path)
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

  if (!putRes.ok) {
    throw new Error(`Storage upload failed (${putRes.status})`);
  }

  // Step 3: tell the server to create the Media DB record
  const confirmRes = await fetch("/api/upload/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, mimeType: file.type, fileName: file.name }),
  });

  if (!confirmRes.ok) {
    const body = await confirmRes.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to confirm upload");
  }

  return confirmRes.json();
}
