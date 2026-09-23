import { describe, expect, it } from "vitest";
import {
  contribution,
  type LedgerChanges,
  type LedgerTx,
  ledgerChanges,
  needsAttention,
} from "./ledger";

type Tx = LedgerTx<"ram" | "sita" | "hari">;
const sale = (extra: Partial<Tx> = {}): Tx => ({
  kind: "sale",
  status: "active",
  dateBs: "2083-06-07",
  partyId: "ram",
  amountPaisa: 234_000,
  ...extra,
});

describe("contribution (architecture §7.4)", () => {
  it("F-02: a named sale adds to the day, the account-month and the account", () => {
    expect(contribution(sale())).toEqual({
      daily: {
        dateBs: "2083-06-07",
        delta: {
          saleCount: 1,
          salePaisa: 234_000,
          purchaseCount: 0,
          purchasePaisa: 0,
          missingAmountCount: 0,
        },
      },
      monthly: {
        partyId: "ram",
        monthBs: "2083-06",
        delta: { billCount: 1, salePaisa: 234_000, purchasePaisa: 0 },
      },
      party: { partyId: "ram", delta: { billCount: 1, salePaisa: 234_000, purchasePaisa: 0 } },
    });
  });

  it("a purchase lands on the purchase side", () => {
    const c = contribution(sale({ kind: "purchase", amountPaisa: 4_230_000, partyId: "hari" }));
    expect(c.daily?.delta).toEqual({
      saleCount: 0,
      salePaisa: 0,
      purchaseCount: 1,
      purchasePaisa: 4_230_000,
      missingAmountCount: 0,
    });
    expect(c.party?.delta).toEqual({ billCount: 1, salePaisa: 0, purchasePaisa: 4_230_000 });
  });

  it("F-02: a bill without an amount counts as a bill but not in totals", () => {
    const c = contribution(sale({ amountPaisa: undefined }));
    expect(c.daily?.delta).toMatchObject({ saleCount: 1, salePaisa: 0, missingAmountCount: 1 });
    expect(c.party?.delta).toEqual({ billCount: 1, salePaisa: 0, purchasePaisa: 0 });
  });

  it("F-04 “पछि”: a bill without a name has no account part", () => {
    const c = contribution(sale({ partyId: undefined }));
    expect(c.daily?.delta.saleCount).toBe(1);
    expect(c.monthly).toBeNull();
    expect(c.party).toBeNull();
  });

  it("F-08: a removed bill contributes nothing", () => {
    expect(contribution(sale({ status: "deleted" }))).toEqual({
      daily: null,
      monthly: null,
      party: null,
    });
  });

  it("F-05: a back-dated bill counts on its own date and month", () => {
    const c = contribution(sale({ dateBs: "2083-05-31" }));
    expect(c.daily?.dateBs).toBe("2083-05-31");
    expect(c.monthly?.monthBs).toBe("2083-05");
  });

  it("v1.1 kinds throw instead of silently contributing zero", () => {
    for (const kind of ["payment_in", "payment_out", "opening_balance", "adjustment"] as const) {
      expect(() => contribution(sale({ kind }))).toThrow(/v1\.1/);
    }
  });

  it("rejects negative or fractional amounts", () => {
    expect(() => contribution(sale({ amountPaisa: -100 }))).toThrow(RangeError);
    expect(() => contribution(sale({ amountPaisa: 10.5 }))).toThrow(RangeError);
  });
});

describe("needsAttention (F-11 queue)", () => {
  it("flags bills with no amount or no name", () => {
    expect(needsAttention(sale())).toBe(false);
    expect(needsAttention(sale({ amountPaisa: undefined }))).toBe(true);
    expect(needsAttention(sale({ partyId: undefined }))).toBe(true);
    expect(
      needsAttention(sale({ kind: "purchase", partyId: undefined, amountPaisa: undefined })),
    ).toBe(true);
  });

  it("never flags non-bill kinds", () => {
    expect(needsAttention({ kind: "payment_in" })).toBe(false);
  });
});

describe("ledgerChanges (create / correct / remove)", () => {
  it("create is exactly the contribution", () => {
    const c = contribution(sale());
    expect(ledgerChanges(null, sale())).toEqual({
      daily: [c.daily],
      monthly: [c.monthly],
      party: [c.party],
    });
  });

  it("F-08 remove is the negative of create; restore undoes it", () => {
    const removed = ledgerChanges(sale(), sale({ status: "deleted" }));
    expect(removed.daily[0]?.delta).toMatchObject({ saleCount: -1, salePaisa: -234_000 });
    expect(removed.party[0]?.delta).toEqual({
      billCount: -1,
      salePaisa: -234_000,
      purchasePaisa: 0,
    });
    expect(ledgerChanges(sale({ status: "deleted" }), sale())).toEqual(ledgerChanges(null, sale()));
  });

  it("an unchanged bill changes nothing", () => {
    expect(ledgerChanges(sale(), sale())).toEqual({ daily: [], monthly: [], party: [] });
    expect(ledgerChanges(null, null)).toEqual({ daily: [], monthly: [], party: [] });
  });

  it("adding the amount later moves it from missing to the total, bill count unchanged", () => {
    expect(ledgerChanges(sale({ amountPaisa: undefined }), sale())).toEqual({
      daily: [
        {
          dateBs: "2083-06-07",
          delta: {
            saleCount: 0,
            salePaisa: 234_000,
            purchaseCount: 0,
            purchasePaisa: 0,
            missingAmountCount: -1,
          },
        },
      ],
      monthly: [
        {
          partyId: "ram",
          monthBs: "2083-06",
          delta: { billCount: 0, salePaisa: 234_000, purchasePaisa: 0 },
        },
      ],
      party: [{ partyId: "ram", delta: { billCount: 0, salePaisa: 234_000, purchasePaisa: 0 } }],
    });
  });

  it("UC-08: moving a bill to another account leaves the day alone", () => {
    const moved = ledgerChanges(sale(), sale({ partyId: "sita" }));
    expect(moved.daily).toEqual([]);
    expect(moved.party).toEqual([
      { partyId: "ram", delta: { billCount: -1, salePaisa: -234_000, purchasePaisa: 0 } },
      { partyId: "sita", delta: { billCount: 1, salePaisa: 234_000, purchasePaisa: 0 } },
    ]);
    expect(moved.monthly.map((m) => [m.partyId, m.monthBs])).toEqual([
      ["ram", "2083-06"],
      ["sita", "2083-06"],
    ]);
  });

  it("F-05: moving a bill across a month end touches both days and both months", () => {
    const moved = ledgerChanges(sale({ dateBs: "2083-05-31" }), sale({ dateBs: "2083-06-01" }));
    expect(moved.daily.map((d) => [d.dateBs, d.delta.saleCount])).toEqual([
      ["2083-05-31", -1],
      ["2083-06-01", 1],
    ]);
    expect(moved.monthly.map((m) => [m.monthBs, m.delta.billCount])).toEqual([
      ["2083-05", -1],
      ["2083-06", 1],
    ]);
    expect(moved.party).toEqual([]); // same account, same totals
  });

  it("changing sold ↔ bought swaps sides", () => {
    const swapped = ledgerChanges(sale(), sale({ kind: "purchase" }));
    expect(swapped.daily[0]?.delta).toEqual({
      saleCount: -1,
      salePaisa: -234_000,
      purchaseCount: 1,
      purchasePaisa: 234_000,
      missingAmountCount: 0,
    });
    expect(swapped.party[0]?.delta).toEqual({
      billCount: 0,
      salePaisa: -234_000,
      purchasePaisa: 234_000,
    });
  });
});

// Algebra that makes corrections safe: applying A→B then B→C equals A→C, and any bill created
// then removed nets to zero. Seeded, so failures reproduce.
describe("ledgerChanges algebra (property)", () => {
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
  const randomTx = (r: () => number): Tx => ({
    kind: pick(r, ["sale", "purchase"] as const),
    status: pick(r, ["active", "active", "deleted"] as const),
    dateBs: pick(r, ["2083-05-30", "2083-05-31", "2083-06-01", "2083-06-07"]),
    partyId: pick(r, ["ram", "sita", "hari", undefined]),
    amountPaisa: pick(r, [undefined, 0, 90_000, 234_000, 4_230_000]),
  });

  const fold = (...all: LedgerChanges[]) => {
    const totals = new Map<string, number>();
    const put = (key: string, delta: Record<string, number>) => {
      for (const [k, n] of Object.entries(delta)) {
        const id = `${key}.${k}`;
        const next = (totals.get(id) ?? 0) + n;
        if (next === 0) totals.delete(id);
        else totals.set(id, next);
      }
    };
    for (const c of all) {
      for (const d of c.daily) put(`d:${d.dateBs}`, d.delta);
      for (const m of c.monthly) put(`m:${m.partyId}:${m.monthBs}`, m.delta);
      for (const p of c.party) put(`p:${p.partyId}`, p.delta);
    }
    return totals;
  };

  it.each([1, 7, 42, 2083, 31337])(
    "seed %i: A→B→C equals A→C, and create+remove nets to zero",
    (seed) => {
      const r = rng(seed);
      for (let i = 0; i < 400; i++) {
        const [a, b, c] = [randomTx(r), randomTx(r), randomTx(r)];
        expect(fold(ledgerChanges(a, b), ledgerChanges(b, c))).toEqual(fold(ledgerChanges(a, c)));
        expect(fold(ledgerChanges(null, a), ledgerChanges(a, null))).toEqual(new Map());
      }
    },
  );
});
