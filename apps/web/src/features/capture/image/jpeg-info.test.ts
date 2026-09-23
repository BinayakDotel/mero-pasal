import { describe, expect, it } from "vitest";
import { fitWithin, orientedSize, readJpegInfo } from "./jpeg-info";

const u16 = (n: number, little = false) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
const u32 = (n: number, little = false) =>
  little
    ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24]
    : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

function exifApp1(orientation: number, little: boolean, extraEntries = 0): number[] {
  const entries: number[] = [];
  for (let i = 0; i < extraEntries; i++)
    entries.push(...u16(0x010f, little), ...u16(2, little), ...u32(1, little), 0, 0, 0, 0);
  entries.push(
    ...u16(0x0112, little),
    ...u16(3, little),
    ...u32(1, little),
    ...u16(orientation, little),
    0,
    0,
  );
  const tiff = [
    ...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(42, little),
    ...u32(8, little),
    ...u16(extraEntries + 1, little),
    ...entries,
    ...u32(0, little),
  ];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return [0xff, 0xe1, ...u16(body.length + 2), ...body];
}
const sof = (width: number, height: number, marker = 0xc0) => [
  0xff,
  marker,
  ...u16(17),
  8,
  ...u16(height),
  ...u16(width),
  3,
  ...new Array(9).fill(0),
];
const app0 = [0xff, 0xe0, ...u16(16), 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
const jpeg = (...parts: number[][]) =>
  new Uint8Array([0xff, 0xd8, ...parts.flat(), 0xff, 0xda, 0, 2]);

describe("readJpegInfo (ADR-010)", () => {
  it("reads size with no EXIF (orientation 1)", () => {
    expect(readJpegInfo(jpeg(app0, sof(4000, 3000)))).toEqual({
      width: 4000,
      height: 3000,
      orientation: 1,
    });
  });

  it("reads EXIF orientation in both byte orders", () => {
    expect(readJpegInfo(jpeg(exifApp1(6, false), sof(4000, 3000)))?.orientation).toBe(6);
    expect(readJpegInfo(jpeg(exifApp1(8, true, 2), sof(4000, 3000)))?.orientation).toBe(8);
  });

  it("reads progressive frames and skips fill bytes and marker-only segments", () => {
    expect(readJpegInfo(jpeg([0xff], [0xff, 0xd0], sof(640, 480, 0xc2)))).toEqual({
      width: 640,
      height: 480,
      orientation: 1,
    });
  });

  it("ignores a bad orientation value or a non-EXIF APP1", () => {
    expect(readJpegInfo(jpeg(exifApp1(9, false), sof(10, 20)))?.orientation).toBe(1);
    const xmp = [0xff, 0xe1, ...u16(8), 0x68, 0x74, 0x74, 0x70, 0x3a, 0x2f];
    expect(readJpegInfo(jpeg(xmp, sof(10, 20)))?.orientation).toBe(1);
  });

  it("returns null for non-JPEG or truncated data", () => {
    expect(readJpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
    expect(readJpegInfo(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(readJpegInfo(jpeg(app0))).toBeNull(); // no frame header before scan data
    expect(readJpegInfo(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00, 0x00]))).toBeNull(); // not a marker
    expect(readJpegInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 8]))).toBeNull(); // cut short
  });

  it("tolerates truncated EXIF", () => {
    const cut = [0xff, 0xe1, ...u16(10), 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d];
    expect(readJpegInfo(jpeg(cut, sof(10, 20)))?.orientation).toBe(1);
  });
});

describe("orientedSize / fitWithin", () => {
  it("swaps width and height for rotated orientations 5–8", () => {
    expect(orientedSize({ width: 4000, height: 3000, orientation: 6 })).toEqual({
      width: 3000,
      height: 4000,
    });
    expect(orientedSize({ width: 4000, height: 3000, orientation: 3 })).toEqual({
      width: 4000,
      height: 3000,
    });
  });

  it("F-03: fits the long edge within 1600 px, never upscaling", () => {
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(8160, 6120, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10_000, 1, 320)).toEqual({ width: 320, height: 1 });
  });
});
