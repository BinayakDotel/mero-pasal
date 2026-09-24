import { afterEach, describe, expect, it, vi } from "vitest";
import { classify } from "./sync-engine";
import { PhotoUnreadableError, uploadBlob } from "./upload";

afterEach(() => vi.unstubAllGlobals());

describe("uploadBlob (iPhone: photos stored on the phone)", () => {
  it("uploads a fresh in-memory copy of the photo, not the stored blob itself", async () => {
    const stored = new Blob(["jpeg-bytes"], { type: "image/jpeg" });
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.body).not.toBe(stored);
      expect(await (init.body as Blob).text()).toBe("jpeg-bytes");
      return new Response(JSON.stringify({ storageId: "s1" }));
    });
    vi.stubGlobal("fetch", fetch);
    expect(await uploadBlob("https://upload", stored)).toBe("s1");
  });

  it("a photo the phone can't read is a real failure with a reason, not 'no internet'", async () => {
    const broken = {
      type: "image/jpeg",
      size: 10,
      arrayBuffer: () => Promise.reject(new DOMException("unreadable", "NotReadableError")),
    } as unknown as Blob;
    vi.stubGlobal("fetch", vi.fn());
    const error = await uploadBlob("https://upload", broken).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PhotoUnreadableError);
    expect(classify(error)).toBe("other");
  });
});
