import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeroPasalDb, type OutboxRow } from "./db";
import type { OutboxDeps, OutboxPage } from "./outbox";
import { SyncEngine } from "./sync-engine";

// Bills saved before the photo table keep their photos inline as Blobs, which the iPhone may no
// longer be able to read. The engine moves them to the table when sending and checks what it
// still has to upload.

const ME = { memberId: "m1", clerkId: "user_me" };
// Stands in for a Blob Safari can no longer read: its type survives being stored, and reading
// such a Blob fails like "The photo on this phone can't be read".
const UNREADABLE = "image/x-unreadable";
const unreadable = () => new Blob(["gone"], { type: UNREADABLE });
const realArrayBuffer = Blob.prototype.arrayBuffer;

let db: MeroPasalDb;
let n = 0;
beforeEach(() => {
  db = new MeroPasalDb(`rescue-${++n}`);
  vi.spyOn(Blob.prototype, "arrayBuffer").mockImplementation(function (this: Blob) {
    return this.type === UNREADABLE
      ? Promise.reject(new DOMException("x", "NotReadableError"))
      : realArrayBuffer.call(this);
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  db.close();
  await Dexie.delete(db.name);
});

function server(makeThumb?: OutboxDeps["makeThumb"]) {
  const uploaded: string[] = [];
  const deps: OutboxDeps = {
    createParty: vi.fn(async () => undefined),
    generateUploadUrl: vi.fn(async () => "url"),
    upload: vi.fn(async (_url, blob: Blob) => {
      uploaded.push(await blob.text());
      return `s${uploaded.length}`;
    }),
    createTx: vi.fn(async () => undefined),
    correctTx: vi.fn(async () => undefined),
    removeTx: vi.fn(async () => undefined),
    makeThumb: makeThumb ?? vi.fn(async () => new Blob(["new-thumb"], { type: "image/jpeg" })),
  };
  return { deps, uploaded };
}

/** A bill as an older phone kept it (schema v1): photos inline in the row, as Blobs. */
async function oldBill(clientId: string, full: Blob, thumb: Blob, page: Partial<OutboxPage> = {}) {
  await db.outbox.add({
    type: "tx.create",
    clientId,
    createdAt: 1,
    attempts: 0,
    payload: { kind: "sale", dateBs: "2083-06-07" },
    pages: [{ full, thumb, width: 1, height: 1, bytes: 4, ...page }],
    status: "pending",
    nextAttemptAt: 0,
    failures: 0,
    ownerMemberId: ME.memberId,
    ownerClerkId: ME.clerkId,
  } as OutboxRow);
}

const send = (deps: OutboxDeps) =>
  new SyncEngine({
    db,
    deps,
    now: () => 1_000_000,
    isConnected: () => true,
    identity: () => ME,
    withLock: (fn) => fn(),
  }).kick();
const row = (clientId: string) => db.outbox.where("clientId").equals(clientId).first();

describe("rescuing photos an older phone kept as Blobs (iPhone)", () => {
  it("readable ones are sent, and kept as bytes from then on", async () => {
    const { deps, uploaded } = server();
    await oldBill("t1", new Blob(["full"]), new Blob(["thumb"]));
    await send(deps);
    expect(uploaded).toEqual(["full", "thumb"]);
    expect((await row("t1"))?.status).toBe("done");
    expect((await db.photos.get("t1:0:full"))?.photo).not.toBeInstanceOf(Blob);
    const [sent] = await db.outbox.toArray();
    expect(sent?.type === "tx.create" && sent.pages[0]).toMatchObject({ fullRef: "t1:0:full" });
  });

  it("an unreadable thumbnail is rebuilt from the full photo, then the bill goes", async () => {
    const { deps, uploaded } = server();
    await oldBill("t1", new Blob(["full"]), unreadable());
    await send(deps);
    expect(uploaded).toEqual(["full", "new-thumb"]);
    expect((await row("t1"))?.status).toBe("done");
  });

  it("an unreadable full photo: PHOTO_LOST at once, nothing uploaded, the queue goes on", async () => {
    const { deps, uploaded } = server();
    await oldBill("lost", unreadable(), new Blob(["thumb"]));
    await oldBill("fine", new Blob(["full2"]), new Blob(["thumb2"]));
    await send(deps);
    expect(await row("lost")).toMatchObject({ status: "failed" });
    expect((await row("lost"))?.lastError).toMatch(/^PHOTO_LOST/);
    expect(uploaded).toEqual(["full2", "thumb2"]);
    expect((await row("fine"))?.status).toBe("done");
  });

  it("a thumbnail that can't be rebuilt is PHOTO_LOST too (never an empty upload)", async () => {
    const { deps, uploaded } = server(async () => {
      throw new Error("can't decode");
    });
    await oldBill("t1", new Blob(["full"]), unreadable());
    await send(deps);
    expect((await row("t1"))?.lastError).toMatch(/^PHOTO_LOST/);
    expect(uploaded).toEqual([]);
  });

  it("photos already uploaded aren't checked again (no false PHOTO_LOST)", async () => {
    const { deps, uploaded } = server();
    await oldBill("t1", unreadable(), unreadable(), { storageId: "s-full", thumbId: "s-thumb" });
    await send(deps);
    expect(uploaded).toEqual([]);
    expect(deps.createTx).toHaveBeenCalledTimes(1);
    expect((await row("t1"))?.status).toBe("done");
  });
});
