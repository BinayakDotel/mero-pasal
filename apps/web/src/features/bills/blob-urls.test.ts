import { afterEach, describe, expect, it, vi } from "vitest";
import { blobUrlFor, forgetBlobUrls } from "./blob-urls";

afterEach(() => {
  forgetBlobUrls();
  vi.restoreAllMocks();
});

describe("blobUrlFor (steady thumbnails on iPhone)", () => {
  it("keeps one URL per photo even when the phone hands back a new copy of the same blob", () => {
    const create = vi.spyOn(URL, "createObjectURL");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const first = blobUrlFor("local:t1", new Blob(["thumb"]));
    const again = blobUrlFor("local:t1", new Blob(["thumb"])); // re-read from IndexedDB
    expect(again).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled(); // never pulled from under a showing <img>
  });

  it("a different photo for the same bill gets a new URL; old ones go only when the cache is full", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const a = blobUrlFor("local:t1", new Blob(["a"]));
    const b = blobUrlFor("local:t1", new Blob(["bb"]));
    expect(b).not.toBe(a);
    for (let i = 0; i < 300; i++) blobUrlFor(`k${i}`, new Blob([String(i)]));
    expect(revoke).toHaveBeenCalled();
  });
});
