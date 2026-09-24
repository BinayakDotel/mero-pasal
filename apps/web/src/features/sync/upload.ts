import { UPLOAD_TIMEOUT_MS } from "./outbox";

/** POST one image to a Convex upload URL; returns its storageId (ADR-010). */
export async function uploadBlob(url: string, blob: Blob): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": blob.type || "image/jpeg" },
    body: blob,
    // A request iOS froze while the app was in the background must not hang the outbox.
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  const { storageId } = (await response.json()) as { storageId: string };
  return storageId;
}
