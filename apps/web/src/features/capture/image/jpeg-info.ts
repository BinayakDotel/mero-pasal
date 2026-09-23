// Reads a JPEG's pixel size and EXIF orientation from its header, without decoding the image,
// so a 50 MP photo can be decoded straight at its reduced size (ADR-010, memory on the Redmi).

export type JpegInfo = { width: number; height: number; orientation: number };

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const NO_LENGTH = new Set([0xd8, 0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);
const SOS = 0xda;
const APP1 = 0xe1;
const ORIENTATION_TAG = 0x0112;

function exifOrientation(bytes: Uint8Array, start: number, end: number): number | null {
  // "Exif\0\0" then a TIFF header
  const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  if (exif.some((b, i) => bytes[start + i] !== b)) return null;
  const tiff = start + 6;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (tiff + 8 > end) return null;
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return null;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (view.getUint16(entry, little) === ORIENTATION_TAG) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** Size and orientation (1–8, default 1) of a JPEG, or null if it isn't a readable JPEG. */
export function readJpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] as number;
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (NO_LENGTH.has(marker)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    const end = Math.min(offset + 2 + length, bytes.length);
    if (marker === APP1) orientation = exifOrientation(bytes, offset + 4, end) ?? orientation;
    if (SOF.has(marker)) {
      if (offset + 9 > bytes.length) return null;
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7), orientation };
    }
    if (marker === SOS) return null; // image data before any frame header: not something we read
    offset += 2 + length;
  }
  return null;
}

/** EXIF orientations 5–8 are rotated a quarter turn, so width and height swap on screen. */
export function orientedSize(info: JpegInfo): { width: number; height: number } {
  return info.orientation >= 5
    ? { width: info.height, height: info.width }
    : { width: info.width, height: info.height };
}

/** Scale down (never up) so the long edge is at most `max`, keeping the aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const scale = max / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
