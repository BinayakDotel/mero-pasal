import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { buildSync } from "esbuild";

// M1 PR 7 / ADR-010: the real photo pipeline in Chromium, no sign-in needed. The processor is
// bundled on the fly and run on a blank page against fixture photos (see fixtures/make-fixtures.py).

const bundle = buildSync({
  entryPoints: [path.join(import.meta.dirname, "../src/features/capture/image/process-image.ts")],
  bundle: true,
  format: "iife",
  globalName: "photoPipeline",
  write: false,
}).outputFiles[0]?.text as string;

const fixture = (name: string) =>
  readFileSync(path.join(import.meta.dirname, "fixtures", name)).toString("base64");

async function run(page: import("@playwright/test").Page, name: string) {
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({ content: bundle });
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    // biome-ignore lint/suspicious/noExplicitAny: global from the esbuild IIFE bundle
    const { processImage } = (window as any).photoPipeline;
    const out = await processImage(new Blob([bytes], { type: "image/jpeg" }));
    const fullBytes = new Uint8Array(await out.full.arrayBuffer());
    const hasApp1 = (() => {
      for (let i = 2; i + 1 < fullBytes.length; i++) {
        if (fullBytes[i] === 0xff && fullBytes[i + 1] === 0xe1) return true;
        if (fullBytes[i] === 0xff && fullBytes[i + 1] === 0xda) return false; // scan data starts
      }
      return false;
    })();
    const text = new TextDecoder("latin1").decode(fullBytes.slice(0, 4096));
    const decoded = await createImageBitmap(out.full);
    const canvas = new OffscreenCanvas(decoded.width, decoded.height);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(decoded, 0, 0);
    const top = ctx.getImageData(Math.floor(decoded.width / 2), 5, 1, 1).data;
    const thumb = await createImageBitmap(out.thumb);
    return {
      width: out.width,
      height: out.height,
      bytes: out.bytes,
      decoded: [decoded.width, decoded.height],
      thumb: [thumb.width, thumb.height],
      hasApp1,
      mentionsMake: text.includes("Xiaomi") || text.includes("Redmi"),
      topPixel: Array.from(top.slice(0, 3)),
    };
  }, fixture(name));
}

test("ADR-010: a sideways phone photo comes out upright, ≤ 1600 px, with no EXIF or GPS", async ({
  page,
}) => {
  const r = await run(page, "rotated.jpg");
  expect([r.width, r.height]).toEqual([1200, 1600]); // 4000×3000 stored, orientation 6 → portrait
  expect(r.decoded).toEqual([1200, 1600]);
  const [red, green] = r.topPixel;
  expect(red).toBeGreaterThan(150); // the red band is now at the top
  expect(green).toBeLessThan(90);
  expect(r.hasApp1).toBe(false); // no EXIF block at all: GPS, make and model are gone
  expect(r.mentionsMake).toBe(false);
  expect(Math.max(...r.thumb)).toBe(320);
  expect(r.bytes).toBeLessThanOrEqual(450_000);
});

test("ADR-010: a 50 MP photo is reduced to 1600 px with a 320 px thumbnail", async ({ page }) => {
  const r = await run(page, "huge.jpg");
  expect([r.width, r.height]).toEqual([1600, 1200]);
  expect(r.thumb).toEqual([320, 240]);
  expect(r.bytes).toBeLessThanOrEqual(450_000);
});

test("an unreadable photo is reported as such (e.g. HEIF)", async ({ page }) => {
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({ content: bundle });
  const name = await page.evaluate(async () => {
    // biome-ignore lint/suspicious/noExplicitAny: global from the esbuild IIFE bundle
    const { processImage } = (window as any).photoPipeline;
    try {
      await processImage(
        new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99])]),
      );
      return "no error";
    } catch (error) {
      return (error as Error).name;
    }
  });
  expect(name).toBe("UnreadablePhotoError");
});
