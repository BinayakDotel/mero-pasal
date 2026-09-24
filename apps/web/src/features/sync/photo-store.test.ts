import "fake-indexeddb/auto";
import { UNDO_WINDOW_MS } from "@mero-pasal/shared/domain";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueRemove } from "./bill-edits";
import { MeroPasalDb } from "./db";
import { readDraft, writeDraftPage } from "./draft-store";
import type { OutboxDeps } from "./outbox";
import { enqueueDurable } from "./outbox-store";
import { asBlob } from "./photo-bytes";
import { SyncEngine } from "./sync-engine";

// Architecture §9: photos live in their own table as bytes; outbox rows hold only references,
// so reading the queue (every screen update, every send) never loads photos.

const ME = { memberId: "m1", clerkId: "user_me" };
const jpeg = (text: string) => new Blob([text], { type: "image/jpeg" });
let name = "";
let n = 0;
let db: MeroPasalDb;
beforeEach(() => {
  name = `store-${++n}`;
  db = new MeroPasalDb(name);
});
afterEach(async () => {
  db.close();
  await Dexie.delete(name);
});

const saveBill = (clientId = "t1") =>
  enqueueDurable(
    db,
    [
      {
        type: "tx.create",
        clientId,
        createdAt: 1,
        attempts: 0,
        payload: { kind: "sale", dateBs: "2083-06-07" },
        pages: [{ full: jpeg("full"), thumb: jpeg("th"), width: 1, height: 1, bytes: 4 }],
      },
    ],
    ME,
    1_000,
  );

describe("the photo table (iPhone: photos as bytes, queue without photos)", () => {
  it("a saved bill's photos are bytes in their own table; its row only points at them", async () => {
    await saveBill();
    const [row] = await db.outbox.toArray();
    const page = row?.type === "tx.create" ? row.pages[0] : undefined;
    expect(page).toEqual({
      fullRef: "t1:0:full",
      thumbRef: "t1:0:thumb",
      width: 1,
      height: 1,
      bytes: 4,
    });
    const stored = await db.photos.get("t1:0:thumb");
    expect(stored?.photo).not.toBeInstanceOf(Blob);
    expect(stored && (await asBlob(stored.photo).text())).toBe("th");
  });

  it("a bill removed before it left the phone takes its photos with it", async () => {
    await saveBill();
    await enqueueRemove(db, "t1", { kind: "sale", dateBs: "2083-06-07" }, ME, 1_000);
    const deps = { upload: vi.fn(), createTx: vi.fn() } as unknown as OutboxDeps;
    await new SyncEngine({
      db,
      deps,
      now: () => 1_000 + UNDO_WINDOW_MS,
      isConnected: () => true,
      identity: () => ME,
      withLock: (fn) => fn(),
    }).kick();
    expect(await db.outbox.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
  });

  it("an unfinished bill's pages are bytes too; readDraft hands back Blobs", async () => {
    await db.drafts.put({
      id: "current",
      kind: "sale",
      clientId: "d1",
      step: "preview",
      pageIds: ["p1"],
      digits: "",
      dateBs: null,
      startedAt: 1,
      savedAt: 1,
    });
    await writeDraftPage(db, { id: "p1", raw: jpeg("raw") });
    expect((await db.draftPages.get("p1"))?.raw).not.toBeInstanceOf(Blob);
    expect(await (await readDraft(db))?.pages[0]?.raw?.text()).toBe("raw");
  });
});

describe("upgrading a phone from schema v1 (photos inside the rows)", () => {
  it("only adds the table: old bills keep their photos where they are, and still send", async () => {
    db.close();
    await Dexie.delete(name);
    const v1 = new Dexie(name);
    v1.version(1).stores({
      outbox: "++seq, &clientId, status, doneAt",
      drafts: "id",
      draftPages: "id",
      cache: "key",
      meta: "key",
    });
    await v1.table("outbox").add({
      type: "tx.create",
      clientId: "old",
      createdAt: 1,
      attempts: 0,
      payload: { kind: "sale", dateBs: "2083-06-07" },
      pages: [{ full: jpeg("F"), thumb: jpeg("T"), width: 1, height: 1, bytes: 1 }],
      status: "pending",
      nextAttemptAt: 0,
      failures: 0,
      ownerMemberId: ME.memberId,
      ownerClerkId: ME.clerkId,
    });
    v1.close();

    db = new MeroPasalDb(name);
    expect(await db.photos.count()).toBe(0); // nothing copied, so nothing can fail here
    const uploaded: string[] = [];
    const deps = {
      generateUploadUrl: vi.fn(async () => "url"),
      upload: vi.fn(async (_u: string, blob: Blob) => {
        uploaded.push(await blob.text());
        return `s${uploaded.length}`;
      }),
      createTx: vi.fn(async () => undefined),
    } as unknown as OutboxDeps;
    await new SyncEngine({
      db,
      deps,
      now: () => 1_000,
      isConnected: () => true,
      identity: () => ME,
      withLock: (fn) => fn(),
    }).kick();
    expect(uploaded).toEqual(["F", "T"]);
  });
});

describe("clean-up (§8.1)", () => {
  it("a bill sent over a month ago leaves no photos behind", async () => {
    await saveBill();
    let clock = 1_000;
    const e = new SyncEngine({
      db,
      deps: {
        generateUploadUrl: vi.fn(async () => "url"),
        upload: vi.fn(async () => "s"),
        createTx: vi.fn(async () => undefined),
      } as unknown as OutboxDeps,
      now: () => clock,
      isConnected: () => true,
      identity: () => ME,
      withLock: (fn) => fn(),
    });
    await e.kick();
    clock += 31 * 86_400_000; // the app wasn't opened for a month
    await e.kick();
    expect(await db.outbox.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
  });
});
