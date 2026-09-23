import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MeroPasalDb } from "./db";
import {
  discardDraft,
  readDraft,
  removeDraftPages,
  writeDraft,
  writeDraftPage,
} from "./draft-store";
import { enqueueDurable } from "./outbox-store";

let db: MeroPasalDb;
let n = 0;
beforeEach(() => {
  db = new MeroPasalDb(`draft-${++n}`);
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const meta = {
  kind: "sale" as const,
  clientId: "t1",
  step: "amount" as const,
  pageIds: ["a", "b"],
  digits: "2340",
  dateBs: null,
  startedAt: 5,
};

describe("draft store (F-03 draft restore)", () => {
  it("restores a draft only when all its pages are on the phone", async () => {
    await writeDraft(db, meta, 10);
    await writeDraftPage(db, { id: "a", raw: new Blob(["raw"]) });
    expect(await readDraft(db)).toBeNull(); // page b missing
    await writeDraftPage(db, {
      id: "b",
      full: new Blob(["f"]),
      thumb: new Blob(["t"]),
      width: 1,
      height: 1,
      bytes: 1,
    });
    const found = await readDraft(db);
    expect(found?.draft).toMatchObject({ clientId: "t1", digits: "2340", savedAt: 10 });
    expect(found?.pages.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("a processed page replaces its raw photo", async () => {
    await writeDraftPage(db, { id: "a", raw: new Blob(["big raw"]) });
    await writeDraftPage(db, {
      id: "a",
      full: new Blob(["f"]),
      thumb: new Blob(["t"]),
      width: 2,
      height: 3,
      bytes: 1,
    });
    const page = await db.draftPages.get("a");
    expect(page?.raw).toBeUndefined();
    expect(page?.width).toBe(2);
  });

  it("a late draft write can't resurrect a bill that was already saved", async () => {
    await writeDraft(db, meta, 10);
    await enqueueDurable(
      db,
      [
        {
          type: "tx.create",
          clientId: "t1",
          createdAt: 1,
          attempts: 0,
          payload: { kind: "sale", dateBs: "2083-06-07" },
          pages: [],
        },
      ],
      { memberId: "m", clerkId: "c" },
      11,
    );
    expect(await db.drafts.count()).toBe(0); // save removed it
    await writeDraft(db, meta, 12); // a debounced write landing afterwards
    expect(await db.drafts.count()).toBe(0);
  });

  it("retaken pages are removed; discard removes everything", async () => {
    await writeDraft(db, meta, 10);
    await writeDraftPage(db, { id: "a", raw: new Blob(["x"]) });
    await writeDraftPage(db, { id: "b", raw: new Blob(["y"]) });
    await removeDraftPages(db, ["a"]);
    expect(await db.draftPages.count()).toBe(1);
    await removeDraftPages(db, []);
    await discardDraft(db);
    expect(await db.drafts.count()).toBe(0);
    expect(await db.draftPages.count()).toBe(0);
    expect(await readDraft(db)).toBeNull();
  });
});
