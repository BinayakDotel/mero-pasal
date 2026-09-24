import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeroPasalDb } from "./db";
import type { OutboxDeps, OutboxItem } from "./outbox";
import { enqueueDurable, StorageFullError } from "./outbox-store";
import { classify, DONE_ROW_TTL_MS, type EngineEnv, MAX_FAILURES, SyncEngine } from "./sync-engine";

const ME = { memberId: "m1", clerkId: "user_me" };
const convexError = (code: string) => Object.assign(new Error(code), { data: { code } });

/** A fake server: remembers what it received, de-duplicates by clientId like Convex does. */
function fakeServer() {
  const parties = new Set<string>();
  const bills = new Map<string, number>();
  const corrections: { clientId: string; amountPaisa?: number }[] = [];
  const removed = new Set<string>();
  let uploads = 0;
  const deps: OutboxDeps = {
    createParty: vi.fn(async ({ clientId }) => {
      parties.add(clientId);
    }),
    generateUploadUrl: vi.fn(async () => "url"),
    upload: vi.fn(async () => `storage-${++uploads}`),
    createTx: vi.fn(async ({ clientId, partyRef }) => {
      if (partyRef && "clientId" in partyRef && !parties.has(partyRef.clientId))
        throw convexError("CONFLICT");
      bills.set(clientId, (bills.get(clientId) ?? 0) + 1);
    }),
    correctTx: vi.fn(async ({ clientId, amountPaisa }) => {
      if (!bills.has(clientId)) throw convexError("NOT_FOUND");
      corrections.push({ clientId, ...(amountPaisa === undefined ? {} : { amountPaisa }) });
    }),
    removeTx: vi.fn(async ({ clientId }) => {
      if (!bills.has(clientId)) throw convexError("NOT_FOUND");
      removed.add(clientId);
    }),
  };
  return { deps, parties, bills, corrections, removed, uploads: () => uploads };
}

const page = () => ({
  full: new Blob(["full"]),
  thumb: new Blob(["thumb"]),
  width: 1,
  height: 1,
  bytes: 4,
});
const party = (clientId = "p1"): OutboxItem => ({
  type: "party.create",
  clientId,
  createdAt: 1,
  attempts: 0,
  payload: { name: "Ram", kind: "customer" },
});
const bill = (clientId = "t1", partyClientId?: string, pages = [page()]): OutboxItem => ({
  type: "tx.create",
  clientId,
  createdAt: 2,
  attempts: 0,
  payload: {
    kind: "sale",
    dateBs: "2083-06-07",
    amountPaisa: 100,
    ...(partyClientId ? { partyRef: { clientId: partyClientId } } : {}),
  },
  pages,
});

let db: MeroPasalDb;
let clock: number;
let n = 0;
beforeEach(() => {
  db = new MeroPasalDb(`test-${++n}`);
  clock = 1_000_000;
});
afterEach(async () => {
  db.close();
  await db.delete();
});

function engine(deps: OutboxDeps, overrides: Partial<EngineEnv> = {}) {
  return new SyncEngine({
    db,
    deps,
    now: () => clock,
    isConnected: () => true,
    identity: () => ME,
    withLock: (fn) => fn(),
    ...overrides,
  });
}
const rows = () => db.outbox.orderBy("seq").toArray();

describe("enqueueDurable (NFR-02)", () => {
  it("stores the name before its bill and clears the draft in the same transaction", async () => {
    await db.drafts.put({
      id: "current",
      kind: "sale",
      clientId: "t1",
      step: "amount",
      pageIds: ["a"],
      digits: "1",
      dateBs: null,
      startedAt: 0,
      savedAt: 0,
    });
    await db.draftPages.put({ id: "a", raw: new Blob(["x"]) });
    await enqueueDurable(db, [bill("t1", "p1"), party("p1")], ME, clock);
    expect((await rows()).map((r) => [r.clientId, r.status, r.ownerClerkId])).toEqual([
      ["p1", "pending", "user_me"],
      ["t1", "pending", "user_me"],
    ]);
    expect(await db.drafts.count()).toBe(0);
    expect(await db.draftPages.count()).toBe(0);
  });

  it("saving the same bill twice queues it once", async () => {
    await enqueueDurable(db, [bill()], ME, clock);
    await enqueueDurable(db, [bill()], ME, clock);
    expect(await db.outbox.count()).toBe(1);
  });

  it("a full phone is reported as StorageFullError and nothing is kept", async () => {
    const add = db.outbox.add.bind(db.outbox);
    db.outbox.add = (() => {
      throw Object.assign(new Error("quota"), { name: "QuotaExceededError" });
    }) as unknown as typeof add;
    await expect(enqueueDurable(db, [bill()], ME, clock)).rejects.toBeInstanceOf(StorageFullError);
    db.outbox.add = add;
    expect(await db.outbox.count()).toBe(0);
  });
});

describe("sync engine (F-09, architecture §8.3)", () => {
  it("UC-05: sends names before bills, oldest first, and marks them done", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [party("p1"), bill("t1", "p1")], ME, clock);
    await enqueueDurable(db, [bill("t2")], ME, clock);
    const e = engine(server.deps);
    await e.kick();
    expect((await rows()).map((r) => r.status)).toEqual(["done", "done", "done"]);
    expect([...server.bills.keys()]).toEqual(["t1", "t2"]);
    expect(e.confirmed.has("t2")).toBe(true);
  });

  it("§8.2: a crash after an upload never uploads that page again", async () => {
    const server = fakeServer();
    let crash = true;
    const createTx = server.deps.createTx;
    server.deps.createTx = vi.fn(async (args) => {
      if (crash) throw new Error("tab killed"); // stands in for the app dying after uploads
      return createTx(args);
    });
    await enqueueDurable(db, [bill("t1", undefined, [page(), page()])], ME, clock);
    await engine(server.deps).kick();
    const saved = (await rows())[0];
    expect(saved?.type === "tx.create" && saved.pages.map((p) => [p.storageId, p.thumbId])).toEqual(
      [
        ["storage-1", "storage-2"],
        ["storage-3", "storage-4"],
      ],
    );
    crash = false;
    clock += 10 * 60_000;
    await engine(server.deps).kick(); // a fresh engine, as after reopening the app
    expect(server.uploads()).toBe(4);
    expect(server.bills.get("t1")).toBe(1);
  });

  it("a crash after the server saved the bill doesn't make a second bill", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill("t1")], ME, clock);
    await engine(server.deps).kick();
    // Simulate: the tab died before "done" was written.
    await db.outbox.toCollection().modify({ status: "uploading" });
    await engine(server.deps).kick();
    expect(server.bills.get("t1")).toBe(2); // sent again...
    expect((await rows())[0]?.status).toBe("done"); // ...and the real server de-duplicates by clientId
  });

  it("stale 'uploading' rows are only reset by the engine holding the lock", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill("t1")], ME, clock);
    await db.outbox.toCollection().modify({ status: "uploading" });
    await engine(server.deps, { withLock: async () => {} }).kick(); // another tab holds the lock
    expect((await rows())[0]?.status).toBe("uploading");
  });

  it("two engines (two tabs) never send the same item", async () => {
    const server = fakeServer();
    for (let i = 0; i < 6; i++) await enqueueDurable(db, [bill(`t${i}`)], ME, clock);
    let chain = Promise.resolve();
    const mutex = (fn: () => Promise<void>) => (chain = chain.then(fn));
    await Promise.all([
      engine(server.deps, { withLock: mutex }).kick(),
      engine(server.deps, { withLock: mutex }).kick(),
    ]);
    expect([...server.bills.values()]).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("a network error never counts toward 'failed', and backs off", async () => {
    const server = fakeServer();
    server.deps.upload = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await enqueueDurable(db, [bill("t1")], ME, clock);
    const e = engine(server.deps);
    for (let i = 0; i < 12; i++) {
      await e.kick();
      clock += 3_600_000;
    }
    const row = (await rows())[0];
    expect(row).toMatchObject({ status: "pending", failures: 0 });
    expect((await e.report()).pauseReason).toBe("network");
  });

  it("offline (Convex disconnected) sends nothing and reports it", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill("t1")], ME, clock);
    const passes: string[] = [];
    await engine(server.deps, {
      isConnected: () => false,
      onPass: (r) => passes.push(r.pauseReason),
    }).kick();
    expect(server.deps.generateUploadUrl).not.toHaveBeenCalled();
    expect(passes).toEqual(["network"]);
  });

  it("auth errors pause the engine without counting failures", async () => {
    const server = fakeServer();
    server.deps.createTx = vi.fn(async () => {
      throw convexError("UNAUTHENTICATED");
    });
    await enqueueDurable(db, [bill("t1"), bill("t2")], ME, clock);
    const e = engine(server.deps);
    await e.kick();
    expect(server.deps.createTx).toHaveBeenCalledTimes(1); // paused after the first
    expect((await rows()).map((r) => [r.status, r.failures])).toEqual([
      ["pending", 0],
      ["pending", 0],
    ]);
    expect((await e.report()).pauseReason).toBe("auth");
  });

  it("while sending isn't allowed yet, the member's saved bills still count as pending", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill("t1")], ME, clock);
    const e = engine(server.deps, { identity: () => null, owner: () => ME });
    await e.kick();
    expect(server.deps.createTx).not.toHaveBeenCalled();
    expect(await e.report()).toMatchObject({ drained: false, pending: 1, foreignPending: 0 });
  });

  it("sign-in coming back ends an auth pause at once (not on the next minute tick)", async () => {
    const server = fakeServer();
    const createTx = server.deps.createTx;
    server.deps.createTx = vi.fn(async () => {
      throw convexError("UNAUTHENTICATED");
    });
    await enqueueDurable(db, [bill("t1")], ME, clock);
    const e = engine(server.deps);
    await e.kick();
    server.deps.createTx = createTx; // Clerk's token has arrived
    await e.kick();
    expect((await rows())[0]?.status).toBe("pending"); // still paused
    await e.resumeAfterAuth();
    expect((await rows())[0]?.status).toBe("done");
  });

  it("a send already on its way when sign-in returns doesn't start a new pause", async () => {
    const server = fakeServer();
    const createTx = server.deps.createTx;
    let rejectFirst: (error: unknown) => void = () => {};
    let calls = 0;
    server.deps.createTx = vi.fn(async (...args: Parameters<typeof createTx>) => {
      calls += 1;
      if (calls === 1)
        return new Promise<never>((_, reject) => {
          rejectFirst = reject;
        });
      return createTx(...args);
    });
    await enqueueDurable(db, [bill("t1")], ME, clock);
    const e = engine(server.deps);
    const pass = e.kick();
    await vi.waitFor(() => expect(calls).toBe(1));
    const resumed = e.resumeAfterAuth(); // sign-in back while the first send is in flight
    rejectFirst(convexError("UNAUTHENTICATED"));
    await Promise.all([pass, resumed]);
    expect((await rows())[0]?.status).toBe("done");
    expect((await e.report()).pauseReason).not.toBe("auth");
  });

  it("a bill waiting for its new name is retried without counting; a failed name blocks it", async () => {
    const server = fakeServer();
    server.deps.createParty = vi.fn(async () => {
      throw convexError("VALIDATION");
    });
    await enqueueDurable(db, [party("p1"), bill("t1", "p1")], ME, clock);
    const e = engine(server.deps);
    await e.kick();
    let [p, t] = await rows();
    expect(p).toMatchObject({ status: "pending", failures: 1 });
    expect(t).toMatchObject({ status: "pending", failures: 0 }); // CONFLICT, not counted
    for (let i = 0; i < MAX_FAILURES + 2; i++) {
      clock += 3_600_000;
      await e.kick();
    }
    [p, t] = await rows();
    expect(p?.status).toBe("failed");
    expect(t).toMatchObject({ status: "failed" });
    expect(t?.lastError).toMatch(/^BLOCKED/);
  });

  it(`${MAX_FAILURES} rejections → failed (kept), and the rest of the queue still goes`, async () => {
    const server = fakeServer();
    const createTx = server.deps.createTx;
    server.deps.createTx = vi.fn(async (args) => {
      if (args.clientId === "bad") throw convexError("VALIDATION");
      return createTx(args);
    });
    await enqueueDurable(db, [bill("bad")], ME, clock);
    await enqueueDurable(db, [bill("good")], ME, clock);
    const e = engine(server.deps);
    for (let i = 0; i < MAX_FAILURES + 1; i++) {
      await e.kick();
      clock += 3_600_000;
    }
    const [bad, good] = await rows();
    expect(bad).toMatchObject({ status: "failed", failures: MAX_FAILURES });
    expect(good?.status).toBe("done");
    expect(await e.report()).toMatchObject({ failed: 1, pending: 0, drained: true });
  });

  it("'Try now' gives failed items a fresh start", async () => {
    const server = fakeServer();
    let reject = true;
    const createTx = server.deps.createTx;
    server.deps.createTx = vi.fn(async (args) => {
      if (reject) throw convexError("VALIDATION");
      return createTx(args);
    });
    await enqueueDurable(db, [bill("t1")], ME, clock);
    const e = engine(server.deps);
    for (let i = 0; i < MAX_FAILURES; i++) {
      await e.kick();
      clock += 3_600_000;
    }
    expect((await rows())[0]?.status).toBe("failed");
    reject = false;
    await e.retryNow();
    expect((await rows())[0]?.status).toBe("done");
  });

  it("only sends the signed-in member's items; another account's are reported, not sent", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill("mine")], ME, clock);
    await enqueueDurable(db, [bill("theirs")], { memberId: "m2", clerkId: "user_other" }, clock);
    const e = engine(server.deps);
    await e.kick();
    expect([...server.bills.keys()]).toEqual(["mine"]);
    expect(await e.report()).toMatchObject({ foreignPending: 1, pending: 0 });
  });

  it("nothing is sent while nobody is signed in", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill("t1")], ME, clock);
    await engine(server.deps, { identity: () => null }).kick();
    expect(server.deps.createTx).not.toHaveBeenCalled();
  });

  it("§8.1 clean-up: photos go after 7 days, rows after 30, unsent items never", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill("old-done")], ME, clock);
    const e = engine(server.deps);
    await e.kick();
    await enqueueDurable(db, [bill("old-pending")], ME, clock);
    await db.outbox
      .where("clientId")
      .equals("old-pending")
      .modify({ nextAttemptAt: Number.MAX_SAFE_INTEGER });

    clock += 8 * 86_400_000;
    await e.kick();
    const done = await db.outbox.where("clientId").equals("old-done").first();
    expect(done?.type === "tx.create" && done.pages[0]?.full.size).toBe(0); // photo freed, row kept

    clock += DONE_ROW_TTL_MS;
    await e.kick();
    expect((await rows()).map((r) => r.clientId)).toEqual(["old-pending"]); // never purged
  });

  it("classifies errors", () => {
    expect(classify(new TypeError("Failed to fetch"))).toBe("network");
    expect(classify(convexError("FORBIDDEN"))).toBe("auth");
    expect(classify(convexError("CONFLICT"))).toBe("conflict");
    expect(classify(convexError("NOT_FOUND"))).toBe("notFound");
    expect(classify(convexError("VALIDATION"))).toBe("other");
    expect(classify(null)).toBe("other");
  });
});

describe("M3 corrections and removals (F-08)", () => {
  const before = { kind: "sale" as const, dateBs: "2083-06-07", amountPaisa: 100 };
  const correct = (billClientId: string, amountPaisa: number, clientId = "op1"): OutboxItem => ({
    type: "tx.correct",
    clientId,
    createdAt: 3,
    attempts: 0,
    payload: { billClientId, kind: "sale", dateBs: "2083-06-07", amountPaisa },
    before,
  });
  const remove = (billClientId: string, clientId = "op2"): OutboxItem => ({
    type: "tx.remove",
    clientId,
    createdAt: 4,
    attempts: 0,
    payload: { billClientId },
    before,
  });

  it("a correction goes after its bill, with the full new values; a removal after that", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill("t1")], ME, clock);
    await enqueueDurable(db, [correct("t1", 250), remove("t1")], ME, clock);
    await engine(server.deps).kick();
    expect(server.bills.get("t1")).toBe(1);
    expect(server.corrections).toEqual([{ clientId: "t1", amountPaisa: 250 }]);
    expect(server.removed.has("t1")).toBe(true);
    expect((await rows()).every((r) => r.status === "done")).toBe(true);
  });

  it("NOT_FOUND while its bill is still on the way: waits, not counted as a failure", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill("t1")], ME, clock);
    await db.outbox
      .where("clientId")
      .equals("t1")
      .modify({ nextAttemptAt: clock + 60_000 });
    await enqueueDurable(db, [correct("t1", 250)], ME, clock);
    await engine(server.deps).kick();
    const op = (await rows()).find((r) => r.clientId === "op1");
    expect(op).toMatchObject({ status: "pending", failures: 0 });
    expect(op?.nextAttemptAt).toBeGreaterThan(clock);
  });

  it("its bill failed → the correction is BLOCKED; an unknown bill is a real failure", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill("t1")], ME, clock);
    await db.outbox.where("clientId").equals("t1").modify({ status: "failed" });
    await enqueueDurable(db, [correct("t1", 250), correct("elsewhere", 5, "op3")], ME, clock);
    await engine(server.deps).kick();
    const [op1, op3] = ["op1", "op3"].map((id) =>
      rows().then((r) => r.find((x) => x.clientId === id)),
    );
    expect(await op1).toMatchObject({ status: "failed", lastError: "BLOCKED: bill t1 failed" });
    expect(await op3).toMatchObject({ status: "pending", failures: 1 });
  });
});
