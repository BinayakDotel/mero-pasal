import "fake-indexeddb/auto";
import { UNDO_WINDOW_MS } from "@mero-pasal/shared/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueCorrect, enqueueRemove, undoRemove } from "./bill-edits";
import { MeroPasalDb } from "./db";
import type { NewOutboxItem, OutboxDeps } from "./outbox";
import { enqueueDurable } from "./outbox-store";
import { SyncEngine } from "./sync-engine";

const ME = { memberId: "m1", clerkId: "user_me" };
const before = { kind: "sale" as const, dateBs: "2083-06-07", amountPaisa: 100 };
const convexError = (code: string) => Object.assign(new Error(code), { data: { code } });

function fakeServer() {
  const bills = new Map<string, number | undefined>();
  const deps: OutboxDeps = {
    createParty: vi.fn(async () => undefined),
    generateUploadUrl: vi.fn(async () => "url"),
    upload: vi.fn(async () => "storage"),
    createTx: vi.fn(async ({ clientId, amountPaisa }) => {
      bills.set(clientId, amountPaisa);
    }),
    correctTx: vi.fn(async ({ clientId, amountPaisa }) => {
      if (!bills.has(clientId)) throw convexError("NOT_FOUND");
      bills.set(clientId, amountPaisa);
    }),
    removeTx: vi.fn(async ({ clientId }) => {
      if (!bills.has(clientId)) throw convexError("NOT_FOUND");
      bills.delete(clientId);
    }),
  };
  return { deps, bills };
}

const bill = (clientId = "t1"): NewOutboxItem => ({
  type: "tx.create",
  clientId,
  createdAt: 1,
  attempts: 0,
  payload: { kind: "sale", dateBs: "2083-06-07", amountPaisa: 100 },
  pages: [{ full: new Blob(["f"]), thumb: new Blob(["t"]), width: 1, height: 1, bytes: 1 }],
});
const values = (amountPaisa: number) => ({
  kind: "sale" as const,
  dateBs: "2083-06-07",
  amountPaisa,
});

let db: MeroPasalDb;
let clock: number;
let n = 0;
beforeEach(() => {
  db = new MeroPasalDb(`edits-${++n}`);
  clock = 1_000_000;
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const engine = (deps: OutboxDeps) =>
  new SyncEngine({
    db,
    deps,
    now: () => clock,
    isConnected: () => true,
    identity: () => ME,
    withLock: (fn) => fn(),
  });
const rows = () => db.outbox.orderBy("seq").toArray();

describe("enqueueCorrect (F-08)", () => {
  it("a bill still on the phone is changed in place: one create, the new amount, no correction", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill()], ME, clock);
    expect(await enqueueCorrect(db, "t1", values(250), before, ME, clock)).toBe("inPlace");
    await engine(server.deps).kick();
    expect(server.bills.get("t1")).toBe(250);
    expect(server.deps.correctTx).not.toHaveBeenCalled();
  });

  it("a sent bill gets one queued correction; a second change updates it before it goes", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill()], ME, clock);
    await engine(server.deps).kick();
    expect(await enqueueCorrect(db, "t1", values(250), before, ME, clock)).toBe("queued");
    expect(await enqueueCorrect(db, "t1", values(300), before, ME, clock)).toBe("inPlace");
    await engine(server.deps).kick();
    expect(server.deps.correctTx).toHaveBeenCalledTimes(1);
    expect(server.bills.get("t1")).toBe(300);
  });

  it("correcting a bill the server refused puts it back in the queue with the new values", async () => {
    await enqueueDurable(db, [bill()], ME, clock);
    await db.outbox.where("clientId").equals("t1").modify({ status: "failed", failures: 5 });
    await enqueueCorrect(db, "t1", values(250), before, ME, clock);
    expect((await rows())[0]).toMatchObject({ status: "pending", failures: 0 });
  });

  it("never touches the unfinished bill (draft)", async () => {
    await enqueueDurable(db, [bill()], ME, clock); // a save clears the draft; edits must not
    await db.drafts.put({
      id: "current",
      kind: "sale",
      clientId: "d1",
      step: "amount",
      pageIds: [],
      digits: "5",
      dateBs: null,
      startedAt: 1,
      savedAt: 1,
    });
    await enqueueCorrect(db, "t1", values(250), before, ME, clock);
    await enqueueRemove(db, "t1", before, ME, clock);
    expect(await db.drafts.count()).toBe(1);
  });
});

describe("enqueueRemove / undoRemove (F-08, UC-07)", () => {
  it("waits out the 6 s undo window, then removes the bill on the server", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill()], ME, clock);
    await engine(server.deps).kick();
    await enqueueRemove(db, "t1", before, ME, clock);
    const e = engine(server.deps);
    await e.kick();
    expect(server.deps.removeTx).not.toHaveBeenCalled();
    clock += UNDO_WINDOW_MS;
    await e.kick();
    expect(server.bills.has("t1")).toBe(false);
  });

  it("undo inside the window: nothing is sent; once sent, undo says no", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill()], ME, clock);
    await engine(server.deps).kick();
    const first = await enqueueRemove(db, "t1", before, ME, clock);
    expect(await undoRemove(db, first)).toBe(true);
    clock += UNDO_WINDOW_MS;
    await engine(server.deps).kick();
    expect(server.deps.removeTx).not.toHaveBeenCalled();

    const second = await enqueueRemove(db, "t1", before, ME, clock);
    clock += UNDO_WINDOW_MS;
    await engine(server.deps).kick();
    expect(await undoRemove(db, second)).toBe(false);
  });

  it("a bill removed before it ever left the phone is dropped: no upload, no server call", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill()], ME, clock);
    await enqueueCorrect(db, "t1", values(250), before, ME, clock);
    await enqueueRemove(db, "t1", before, ME, clock);
    clock += UNDO_WINDOW_MS;
    await engine(server.deps).kick();
    expect(server.deps.upload).not.toHaveBeenCalled();
    expect(server.deps.createTx).not.toHaveBeenCalled();
    expect(server.deps.removeTx).not.toHaveBeenCalled();
    expect(await rows()).toEqual([]);
  });

  it("inside the undo window, the unsent bill still goes (Undo stays possible)", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill()], ME, clock);
    await enqueueRemove(db, "t1", before, ME, clock);
    await engine(server.deps).kick();
    expect(server.bills.has("t1")).toBe(true);
  });
});

describe("review fixes: sending exactly what's queued, in order (F-08)", () => {
  // Runs `between` in the gap after the engine picked its next item and before it sends it.
  const engineWithGap = (deps: OutboxDeps, between: () => Promise<void>) => {
    const e = engine(deps);
    const inner = e as unknown as { droppedOnPhone: (...a: unknown[]) => Promise<boolean> };
    const original = inner.droppedOnPhone.bind(e);
    let once = false;
    inner.droppedOnPhone = async (...a) => {
      if (!once) {
        once = true;
        await between();
      }
      return original(...a);
    };
    return e;
  };

  it("Undo in the gap before sending: the removal is not sent", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill()], ME, clock);
    await engine(server.deps).kick();
    const removal = await enqueueRemove(db, "t1", before, ME, clock);
    clock += UNDO_WINDOW_MS;
    await engineWithGap(server.deps, async () => {
      await undoRemove(db, removal);
    }).kick();
    expect(server.deps.removeTx).not.toHaveBeenCalled();
    expect(server.bills.has("t1")).toBe(true);
  });

  it("a correction made in the gap is what gets sent", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill()], ME, clock);
    await engineWithGap(server.deps, async () => {
      await enqueueCorrect(db, "t1", values(777), before, ME, clock);
    }).kick();
    expect(server.bills.get("t1")).toBe(777);
  });

  it("a later change to a bill waits for an earlier one still on its way", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill()], ME, clock);
    await engine(server.deps).kick();
    await enqueueCorrect(db, "t1", values(200), before, ME, clock);
    await db.outbox
      .filter((r) => r.type === "tx.correct")
      .modify({ status: "pending", nextAttemptAt: clock + 60_000 }); // first one in backoff
    await enqueueRemove(db, "t1", before, ME, clock - UNDO_WINDOW_MS); // already due
    await engine(server.deps).kick();
    expect(server.deps.removeTx).not.toHaveBeenCalled();
    clock += 60_000;
    await engine(server.deps).kick();
    expect(vi.mocked(server.deps.correctTx).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(server.deps.removeTx).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("'Try now' never cuts the 6 s undo window short", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill()], ME, clock);
    const e = engine(server.deps);
    await e.kick();
    const removal = await enqueueRemove(db, "t1", before, ME, clock);
    await e.retryNow();
    expect(server.deps.removeTx).not.toHaveBeenCalled();
    expect(await undoRemove(db, removal)).toBe(true);
  });
});

describe("review fixes: a bill the server may already have (F-08)", () => {
  it("killed right after the server saved it: removing it still reaches the server", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill()], ME, clock);
    // The tab died after createTx committed but before "done" was written.
    server.bills.set("t1", 100);
    await db.outbox
      .where("clientId")
      .equals("t1")
      .modify((r) => {
        if (r.type === "tx.create") r.submitted = true;
      });
    await enqueueRemove(db, "t1", before, ME, clock);
    clock += UNDO_WINDOW_MS;
    await engine(server.deps).kick();
    expect(server.bills.has("t1")).toBe(false);
  });

  it("…and correcting it queues a correction instead of changing a create the server ignores", async () => {
    await enqueueDurable(db, [bill()], ME, clock);
    await db.outbox
      .where("clientId")
      .equals("t1")
      .modify((r) => {
        if (r.type === "tx.create") r.submitted = true;
      });
    expect(await enqueueCorrect(db, "t1", values(250), before, ME, clock)).toBe("queued");
  });

  it("the mark is set before sending and cleared when the server clearly refused the bill", async () => {
    const server = fakeServer();
    server.deps.createTx = vi.fn(async () => {
      throw new TypeError("network down");
    });
    await enqueueDurable(db, [bill()], ME, clock);
    await engine(server.deps).kick();
    const submitted = async () => {
      const [r] = await rows();
      return r?.type === "tx.create" ? r.submitted : undefined;
    };
    expect(await submitted()).toBe(true);

    server.deps.createTx = vi.fn(async () => {
      throw convexError("VALIDATION");
    });
    clock += 3_600_000;
    await engine(server.deps).kick();
    expect(await submitted()).toBe(false);
  });
});

describe("a new name while correcting (F-04 in F-08)", () => {
  const sita = {
    type: "party.create" as const,
    clientId: "p-sita",
    createdAt: 1,
    attempts: 0,
    payload: { name: "Sita", kind: "customer" as const },
  };
  const toSita = { ...values(250), partyRef: { clientId: "p-sita" } };
  const serverWithNames = () => {
    const server = fakeServer();
    const order: string[] = [];
    server.deps.createParty = vi.fn(async ({ clientId }) => {
      order.push(`party:${clientId}`);
    });
    const createTx = server.deps.createTx;
    server.deps.createTx = vi.fn(async (a) => {
      order.push(`tx:${a.clientId}`);
      return createTx(a);
    });
    const correctTx = server.deps.correctTx;
    server.deps.correctTx = vi.fn(async (a) => {
      order.push(`correct:${a.clientId}`);
      return correctTx(a);
    });
    return { ...server, order };
  };

  it("a sent bill: the name goes first, then the correction", async () => {
    const server = serverWithNames();
    await enqueueDurable(db, [bill()], ME, clock);
    await engine(server.deps).kick();
    await enqueueCorrect(db, "t1", toSita, before, ME, clock, sita);
    await engine(server.deps).kick();
    expect(server.order).toEqual(["tx:t1", "party:p-sita", "correct:t1"]);
  });

  it("a bill still on the phone: re-queued after its new name, sent once", async () => {
    const server = serverWithNames();
    await enqueueDurable(db, [bill()], ME, clock);
    expect(await enqueueCorrect(db, "t1", toSita, before, ME, clock, sita)).toBe("inPlace");
    await engine(server.deps).kick();
    expect(server.order).toEqual(["party:p-sita", "tx:t1"]);
    expect(server.bills.get("t1")).toBe(250);
  });
});

describe("waking up when the next item is due", () => {
  it("the report says when a queued removal becomes due (so the app can wake then)", async () => {
    const server = fakeServer();
    await enqueueDurable(db, [bill()], ME, clock);
    const e = engine(server.deps);
    await e.kick();
    await enqueueRemove(db, "t1", before, ME, clock);
    await e.kick();
    expect((await e.report()).nextDueAt).toBe(clock + UNDO_WINDOW_MS);
  });
});
