import { describe, expect, it } from "vitest";
import type { OutboxRow } from "@/features/sync/db";
import { applyEdits, type BillItem, localBills, mergeBills, nameBook } from "./bill-item";

const item = (clientId: string, dateBs: string, capturedAt: number, pending = false): BillItem => ({
  key: clientId,
  clientId,
  kind: "sale",
  dateBs,
  isWalkIn: false,
  capturedAt,
  thumb: null,
  pending,
});

describe("mergeBills (F-06, F-09)", () => {
  it("server rows win; phone-only rows join; newest date, then time, first", () => {
    const merged = mergeBills(
      [item("a", "2083-06-07", 10), item("b", "2083-06-07", 30), item("old", "2083-06-05", 99)],
      [item("a", "2083-06-07", 10, true), item("c", "2083-06-07", 20, true)],
    );
    expect(merged.map((m) => [m.clientId, m.pending])).toEqual([
      ["b", false],
      ["c", true],
      ["a", false],
      ["old", false],
    ]);
  });
});

describe("localBills (F-09)", () => {
  const photo = new Blob(["t"]);
  const rows = [
    {
      seq: 1,
      type: "party.create",
      clientId: "p-new",
      status: "pending",
      payload: { name: "Sita", kind: "customer" },
    },
    {
      seq: 2,
      type: "tx.create",
      clientId: "t1",
      status: "pending",
      createdAt: 5,
      payload: {
        kind: "sale",
        dateBs: "2083-06-07",
        partyRef: { clientId: "p-new" },
        amountPaisa: 100,
      },
      pages: [{ full: photo, thumb: photo }],
    },
    {
      seq: 3,
      type: "tx.create",
      clientId: "t2",
      status: "done",
      createdAt: 6,
      payload: { kind: "purchase", dateBs: "2083-06-06", partyRef: { id: "party_ram" } },
      pages: [],
    },
  ] as unknown as OutboxRow[];
  const names = nameBook(
    [{ _id: "party_ram", clientId: "c-ram", displayName: "Ram", isWalkIn: false }],
    rows,
  );

  it("names bills from synced accounts and names added on the phone", () => {
    const all = localBills(rows, names, () => true);
    expect(all.map((b) => [b.clientId, b.partyName, b.partyId, b.pending])).toEqual([
      ["t1", "Sita", undefined, true],
      ["t2", "Ram", "party_ram", false],
    ]);
    expect(all[0]?.thumb).toEqual({ blob: photo });
  });

  it("keeps only the bills the caller asks for", () => {
    expect(localBills(rows, names, (r) => r.payload.dateBs === "2083-06-06")).toHaveLength(1);
  });
});

describe("applyEdits (F-08 on the phone)", () => {
  const names = nameBook(
    [{ _id: "party_sita", clientId: "c-sita", displayName: "Sita Shrestha", isWalkIn: false }],
    [],
  );
  const op = (type: string, status: string, payload: Record<string, unknown>) =>
    ({
      type,
      status,
      clientId: `op-${type}-${status}`,
      payload: { billClientId: "a", ...payload },
    }) as unknown as OutboxRow;
  const bills = [item("a", "2083-06-07", 1), item("b", "2083-06-07", 2)];

  it("a removal on its way hides the bill; a refused or finished one doesn't", () => {
    expect(
      applyEdits(bills, [op("tx.remove", "pending", {})], names).map((b) => b.clientId),
    ).toEqual(["b"]);
    expect(applyEdits(bills, [op("tx.remove", "failed", {})], names)).toHaveLength(2);
    expect(applyEdits(bills, [op("tx.remove", "done", {})], names)).toHaveLength(2);
  });

  it("a correction on its way shows the new values with the clock; the latest wins", () => {
    const [edited] = applyEdits(
      bills,
      [
        op("tx.correct", "uploading", { kind: "sale", dateBs: "2083-06-07", amountPaisa: 5 }),
        op("tx.correct", "pending", {
          kind: "purchase",
          dateBs: "2083-06-06",
          amountPaisa: 900,
          partyRef: { id: "party_sita" },
        }),
      ],
      names,
    );
    expect(edited).toMatchObject({
      clientId: "a",
      kind: "purchase",
      dateBs: "2083-06-06",
      amountPaisa: 900,
      partyId: "party_sita",
      partyName: "Sita Shrestha",
      pending: true,
    });
  });
});

describe("applyEdits agrees with Today's totals (review fix)", () => {
  const names = nameBook([], []);
  const removal = {
    type: "tx.remove",
    status: "done",
    doneAt: 20,
    clientId: "op",
    payload: { billClientId: "a" },
  } as unknown as OutboxRow;
  const bills = [item("a", "2083-06-07", 1)];

  it("on a saved copy older than the removal, the bill stays hidden (as in the totals)", () => {
    const olderCopy = (r: OutboxRow) => r.status !== "done" || (r.doneAt ?? 0) > 10;
    expect(applyEdits(bills, [removal], names, olderCopy)).toEqual([]);
  });

  it("on a live copy, a finished removal is already reflected by the server", () => {
    expect(applyEdits(bills, [removal], names)).toHaveLength(1);
  });
});
