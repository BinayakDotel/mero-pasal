"use client";

import { type ProcessedPhoto, processImage } from "./process-image";

/**
 * F-03 / ADR-010: shrink a photo for upload (≤ 1600 px + 320 px thumbnail, no EXIF/GPS).
 * Runs from the page: the heavy steps (`createImageBitmap` decode-with-resize and JPEG encode)
 * are asynchronous browser work off the main thread, so the preview stays responsive. A Web
 * Worker was dropped because Turbopack copies `new Worker(new URL(...))` targets as raw assets.
 * Rejects with UnreadablePhotoError for photos the phone can't decode (e.g. HEIF).
 */
export function processPhoto(blob: Blob): Promise<ProcessedPhoto> {
  return processImage(blob);
}
