import { UPLOAD_TIMEOUT_MS } from "./outbox";

/** The photo saved on the phone can't be read back (a local problem, not the network). */
export class PhotoUnreadableError extends Error {
  constructor(cause: unknown) {
    super("The photo on this phone can't be read", { cause });
    this.name = "PhotoUnreadableError";
  }
}

/**
 * POST one image to a Convex upload URL; returns its storageId (ADR-010). The stored blob is read
 * into memory first and a fresh copy is sent: Safari can fail to send a Blob that came out of
 * IndexedDB, and that failure looked like "no internet" (the bill waited forever).
 */
export async function uploadBlob(url: string, blob: Blob): Promise<string> {
  let bytes: ArrayBuffer;
  try {
    bytes = await blob.arrayBuffer();
  } catch (error) {
    throw new PhotoUnreadableError(error);
  }
  const type = blob.type || "image/jpeg";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": type },
    body: new Blob([bytes], { type }),
    // A request iOS froze while the app was in the background must not hang the outbox.
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  const { storageId } = (await response.json()) as { storageId: string };
  return storageId;
}
