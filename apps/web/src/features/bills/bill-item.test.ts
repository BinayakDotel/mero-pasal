import { describe, expect, it } from "vitest";
import type { OutboxRow } from "@/features/sync/db";
import { type BillItem, localBills, mergeBills, nameBook } from "./bill-item";

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
