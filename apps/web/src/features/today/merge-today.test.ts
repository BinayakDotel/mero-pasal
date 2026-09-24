import { describe, expect, it } from "vitest";
import type { OutboxRow } from "@/features/sync/db";
import { mergeTotals, notYetOnServer, ZERO } from "./merge-today";

const row = (
  clientId: string,
  over: Partial<OutboxRow> = {},
  amount?: number,
  dateBs = "2083-06-07",
): OutboxRow =>
  ({
    type: "tx.create",
    clientId,
    createdAt: 1,
    attempts: 0,
    payload: { kind: "sale", dateBs, ...(amount === undefined ? {} : { amountPaisa: amount }) },
    pages: [],
    status: "pending",
    nextAttemptAt: 0,
    failures: 0,
    ownerMemberId: "m",
    ownerClerkId: "c",
    ...over,
  }) as OutboxRow;

const live = { live: true, snapshotAt: 0 };
const cached = (snapshotAt: number) => ({ live: false, snapshotAt });

describe("notYetOnServer (count every bill exactly once)", () => {
  it("live data: pending counts; done or just-confirmed doesn't", () => {
    expect(notYetOnServer(row("a"), live, new Set())).toBe(true);
    expect(notYetOnServer(row("a", { status: "done", doneAt: 5 }), live, new Set())).toBe(false);
    // Confirmed by the server this instant, "done" not yet written to the phone: no double count.
    expect(notYetOnServer(row("a", { status: "uploading" }), live, new Set(["a"]))).toBe(false);
  });

  it("cached data: a bill confirmed after the snapshot still counts locally", () => {
    expect(notYetOnServer(row("a", { status: "done", doneAt: 20 }), cached(10), new Set())).toBe(
      true,
    );
    expect(notYetOnServer(row("a", { status: "done", doneAt: 5 }), cached(10), new Set())).toBe(
      false,
    );
    expect(notYetOnServer(row("a", { status: "failed" }), cached(10), new Set())).toBe(true);
  });
});

describe("mergeTotals (F-02 offline)", () => {
  it("adds today's pending bills to the server totals, with and without amounts", () => {
    const totals = mergeTotals(
      { ...ZERO, saleCount: 2, salePaisa: 500 },
      [
        row("a", {}, 100),
        row("b"),
        row("old", {}, 999, "2083-06-06"),
        row("sent", { status: "done", doneAt: 1 }, 7),
      ],
      "2083-06-07",
      live,
      new Set(),
    );
    expect(totals).toEqual({ ...ZERO, saleCount: 4, salePaisa: 600, missingAmountCount: 1 });
  });

  it("purchases land on the purchase side; name items are ignored", () => {
    const purchase = row("p", {}, 300);
    if (purchase.type === "tx.create") purchase.payload.kind = "purchase";
    const nameItem = {
      ...row("n"),
      type: "party.create",
      payload: { name: "Ram", kind: "customer" },
    } as unknown as OutboxRow;
    expect(mergeTotals(ZERO, [purchase, nameItem], "2083-06-07", live, new Set())).toEqual({
      ...ZERO,
      purchaseCount: 1,
      purchasePaisa: 300,
    });
  });
});

describe("mergeTotals with corrections and removals on their way (M3, F-08)", () => {
  const server = { ...ZERO, saleCount: 2, salePaisa: 300 };
  const before = { kind: "sale" as const, dateBs: "2083-06-07", amountPaisa: 100 };
  const op = (
    type: "tx.correct" | "tx.remove",
    over: Partial<OutboxRow> = {},
    payload: Record<string, unknown> = {},
  ): OutboxRow =>
    ({
      type,
      clientId: `op-${type}`,
      createdAt: 1,
      attempts: 0,
      payload: { billClientId: "t1", ...payload },
      before,
      status: "pending",
      nextAttemptAt: 0,
      failures: 0,
      ownerMemberId: "m",
      ownerClerkId: "c",
      ...over,
    }) as OutboxRow;
  const merge = (rows: OutboxRow[]) => mergeTotals(server, rows, "2083-06-07", live, new Set());

  it("a correction swaps the old values for the new, once", () => {
    const fix = op("tx.correct", {}, { kind: "sale", dateBs: "2083-06-07", amountPaisa: 250 });
    expect(merge([fix])).toMatchObject({ saleCount: 2, salePaisa: 450 });
  });

  it("a correction to another day or type moves the bill out of today's sales", () => {
    const moved = op("tx.correct", {}, { kind: "sale", dateBs: "2083-06-06", amountPaisa: 100 });
    const retyped = op(
      "tx.correct",
      {},
      { kind: "purchase", dateBs: "2083-06-07", amountPaisa: 100 },
    );
    expect(merge([moved])).toMatchObject({ saleCount: 1, salePaisa: 200 });
    expect(merge([retyped])).toMatchObject({ saleCount: 1, purchaseCount: 1, purchasePaisa: 100 });
  });

  it("a removal takes the bill out; a refused or finished change leaves the server numbers", () => {
    expect(merge([op("tx.remove")])).toMatchObject({ saleCount: 1, salePaisa: 200 });
    expect(merge([op("tx.remove", { status: "failed" })])).toEqual(server);
    expect(merge([op("tx.remove", { status: "done", doneAt: 1 })])).toEqual(server);
  });

  it("a bill still on the phone, then removed: counted by neither", () => {
    const phone = row("t1", {}, 100);
    expect(mergeTotals(ZERO, [phone, op("tx.remove")], "2083-06-07", live, new Set())).toEqual(
      ZERO,
    );
  });
});
