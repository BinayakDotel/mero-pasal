import { fitWithin, orientedSize, readJpegInfo } from "./jpeg-info";

// ADR-010 / architecture §9: full image ≤ 1600 px long edge at JPEG ~0.72 (retry 0.6 if still
// big), plus a 320 px thumbnail made from the reduced image. Re-encoding through a canvas drops
// every EXIF field, including GPS, so the original file is never uploaded.

export const FULL_MAX_EDGE = 1600;
export const THUMB_MAX_EDGE = 320;
export const JPEG_QUALITY = 0.72;
export const JPEG_RETRY_QUALITY = 0.6;
export const TARGET_MAX_BYTES = 450_000;

export type ProcessedPhoto = {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  bytes: number;
};

/** The photo couldn't be decoded (e.g. HEIF from the Xiaomi camera). */
export class UnreadablePhotoError extends Error {
  constructor(cause: unknown) {
    super("This photo couldn't be read", { cause });
    this.name = "UnreadablePhotoError";
  }
}

type Canvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(width: number, height: number): Canvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toJpeg(canvas: Canvas, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/jpeg", quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("JPEG encode failed"))),
      "image/jpeg",
      quality,
    ),
  );
}

function draw(source: CanvasImageSource, width: number, height: number): Canvas {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("No 2D canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** Decode `blob` at (about) the target size, already turned the right way up. */
async function decodeReduced(
  blob: Blob,
): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  const info = readJpegInfo(new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer()));
  if (info) {
    const target = fitWithin(orientedSize(info).width, orientedSize(info).height, FULL_MAX_EDGE);
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: "high",
      });
      // Guard against engines that resize before rotating (would squash the aspect ratio).
      const expected = target.width / target.height;
      if (Math.abs(bitmap.width / bitmap.height - expected) < 0.02) return { bitmap, ...target };
      bitmap.close();
    } catch {
      // fall through to a plain decode
    }
  }
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  return { bitmap, ...fitWithin(bitmap.width, bitmap.height, FULL_MAX_EDGE) };
}

/** F-03 photo pipeline. Works in a worker or on the main thread. */
export async function processImage(blob: Blob): Promise<ProcessedPhoto> {
  let decoded: Awaited<ReturnType<typeof decodeReduced>>;
  try {
    decoded = await decodeReduced(blob);
  } catch (error) {
    throw new UnreadablePhotoError(error);
  }
  const { bitmap, width, height } = decoded;
  try {
    const canvas = draw(bitmap, width, height);
    let full = await toJpeg(canvas, JPEG_QUALITY);
    if (full.size > TARGET_MAX_BYTES) full = await toJpeg(canvas, JPEG_RETRY_QUALITY);
    const t = fitWithin(width, height, THUMB_MAX_EDGE);
    const thumb = await toJpeg(draw(canvas, t.width, t.height), JPEG_QUALITY);
    return { full, thumb, width, height, bytes: full.size };
  } finally {
    bitmap.close();
  }
}
