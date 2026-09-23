// Ledger contributions (architecture §7.4, ADR-013). One pure description of how a transaction
// affects every piece of derived data, shared by `convex/lib/ledger.apply` and its tests.
// Removing a bill is `before = tx, after = {...tx, status: "deleted"}`: deleted bills contribute
// nothing, so subtract-then-add handles create, correct, remove and restore alike.

import { monthOf } from "../dates/dates";
import { BILL_KINDS, type BillKind, type TxKind } from "../domain/domain";
import { assertPaisa } from "../money/money";

/** The fields of a transaction the ledger reads. `P` is the party id type (a Convex Id). */
export type LedgerTx<P extends string = string> = {
  kind: TxKind;
  status: "active" | "deleted";
  dateBs: string;
  partyId?: P | undefined;
  amountPaisa?: number | undefined;
};

export type DailyDelta = {
  saleCount: number;
  salePaisa: number;
  purchaseCount: number;
  purchasePaisa: number;
  missingAmountCount: number;
};
export type PartyDelta = { billCount: number; salePaisa: number; purchasePaisa: number };

export type Contribution<P extends string = string> = {
  daily: { dateBs: string; delta: DailyDelta } | null;
  monthly: { partyId: P; monthBs: string; delta: PartyDelta } | null;
  party: { partyId: P; delta: PartyDelta } | null;
};

const NONE = { daily: null, monthly: null, party: null } as const;

function isBillKind(kind: TxKind): kind is BillKind {
  return (BILL_KINDS as readonly TxKind[]).includes(kind);
}

/**
 * What one transaction adds to the derived data. Deleted → nothing. Bills without an amount
 * count as bills (F-02) and add to `missingAmountCount`, not to totals. Partyless bills have no
 * monthly or party part. v1.1 kinds throw until their balance maths exists, so they can never
 * silently corrupt totals.
 */
export function contribution<P extends string>(tx: LedgerTx<P>): Contribution<P> {
  if (!isBillKind(tx.kind)) {
    throw new RangeError(`Ledger contribution for "${tx.kind}" arrives in v1.1`);
  }
  if (tx.status === "deleted") return NONE;

  const amount = tx.amountPaisa;
  if (amount !== undefined) {
    assertPaisa(amount);
    if (amount < 0) throw new RangeError(`A bill amount cannot be negative, got ${amount}`);
  }
  const paisa = amount ?? 0;
  const isSale = tx.kind === "sale";

  const daily: DailyDelta = {
    saleCount: isSale ? 1 : 0,
    salePaisa: isSale ? paisa : 0,
    purchaseCount: isSale ? 0 : 1,
    purchasePaisa: isSale ? 0 : paisa,
    missingAmountCount: amount === undefined ? 1 : 0,
  };
  if (tx.partyId === undefined) {
    return { daily: { dateBs: tx.dateBs, delta: daily }, monthly: null, party: null };
  }
  const party: PartyDelta = {
    billCount: 1,
    salePaisa: isSale ? paisa : 0,
    purchasePaisa: isSale ? 0 : paisa,
  };
  return {
    daily: { dateBs: tx.dateBs, delta: daily },
    monthly: { partyId: tx.partyId, monthBs: monthOf(tx.dateBs), delta: party },
    party: { partyId: tx.partyId, delta: party },
  };
}

/** Architecture §5.2 `needsAttention`: a bill with no amount or no name (F-11 queue). */
export function needsAttention(tx: Pick<LedgerTx, "kind" | "partyId" | "amountPaisa">): boolean {
  return isBillKind(tx.kind) && (tx.amountPaisa === undefined || tx.partyId === undefined);
}

export type LedgerChanges<P extends string = string> = {
  daily: { dateBs: string; delta: DailyDelta }[];
  monthly: { partyId: P; monthBs: string; delta: PartyDelta }[];
  party: { partyId: P; delta: PartyDelta }[];
};

function accumulate<D extends DailyDelta | PartyDelta>(
  into: Map<string, D>,
  key: string,
  delta: D,
  sign: 1 | -1,
): void {
  const current: Record<string, number> | undefined = into.get(key);
  const next: Record<string, number> = {};
  for (const [field, n] of Object.entries(delta)) next[field] = (current?.[field] ?? 0) + sign * n;
  into.set(key, next as D);
}

const isZero = (delta: Record<string, number>) => Object.values(delta).every((n) => n === 0);

/**
 * The net change from `before` to `after` (either may be null for create / hard absence):
 * `contribution(after) − contribution(before)`, merged per row and with no-op rows dropped.
 * `ledger.apply` writes exactly these deltas.
 */
export function ledgerChanges<P extends string>(
  before: LedgerTx<P> | null,
  after: LedgerTx<P> | null,
): LedgerChanges<P> {
  const daily = new Map<string, DailyDelta>();
  const monthly = new Map<string, PartyDelta>();
  const party = new Map<string, PartyDelta>();
  const monthKeys = new Map<string, { partyId: P; monthBs: string }>();

  const add = (tx: LedgerTx<P> | null, sign: 1 | -1) => {
    if (!tx) return;
    const c = contribution(tx);
    if (c.daily) accumulate(daily, c.daily.dateBs, c.daily.delta, sign);
    if (c.monthly) {
      const key = `${c.monthly.partyId}|${c.monthly.monthBs}`;
      monthKeys.set(key, { partyId: c.monthly.partyId, monthBs: c.monthly.monthBs });
      accumulate(monthly, key, c.monthly.delta, sign);
    }
    if (c.party) accumulate(party, c.party.partyId, c.party.delta, sign);
  };
  add(before, -1);
  add(after, 1);

  return {
    daily: [...daily]
      .filter(([, delta]) => !isZero(delta))
      .map(([dateBs, delta]) => ({ dateBs, delta })),
    monthly: [...monthly]
      .filter(([, delta]) => !isZero(delta))
      .map(([key, delta]) => ({
        ...(monthKeys.get(key) as { partyId: P; monthBs: string }),
        delta,
      })),
    party: [...party]
      .filter(([, delta]) => !isZero(delta))
      .map(([partyId, delta]) => ({ partyId: partyId as P, delta })),
  };
}
