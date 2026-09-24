import { contribution } from "@mero-pasal/shared/ledger";
import type { OutboxRow } from "@/features/sync/db";

// M2 offline views (F-02, F-09): Today = what the server knows + bills still on the phone.
// Every bill must be counted exactly once while it moves from phone to server.

export type DayTotals = {
  saleCount: number;
  salePaisa: number;
  purchaseCount: number;
  purchasePaisa: number;
  missingAmountCount: number;
};
export const ZERO: DayTotals = {
  saleCount: 0,
  salePaisa: 0,
  purchaseCount: 0,
  purchasePaisa: 0,
  missingAmountCount: 0,
};

/**
 * Is this phone-side bill NOT yet included in the server numbers we're showing?
 * - live server data: anything not yet confirmed (confirmed = the mutation resolved, and Convex
 *   queries reflect a mutation before it resolves);
 * - cached data (offline): anything confirmed after the snapshot was taken.
 */
export function notYetOnServer(
  row: Pick<OutboxRow, "clientId" | "status" | "doneAt">,
  view: { live: boolean; snapshotAt: number },
  confirmed: ReadonlySet<string>,
): boolean {
  if (view.live) return row.status !== "done" && !confirmed.has(row.clientId);
  return row.status !== "done" || (row.doneAt ?? 0) > view.snapshotAt;
}

const add = (total: DayTotals, tx: Parameters<typeof contribution>[0], sign: 1 | -1) => {
  const { daily } = contribution(tx);
  if (!daily) return;
  for (const key of Object.keys(total) as (keyof DayTotals)[])
    total[key] += sign * daily.delta[key];
};

/**
 * Today's totals: server totals plus the day's phone-side bills not yet counted there, adjusted
 * for corrections and removals not yet applied there (M3): out goes what the phone showed
 * before, in comes the new version. Each change counts once, like a bill.
 */
export function mergeTotals(
  server: DayTotals,
  local: readonly OutboxRow[],
  dateBs: string,
  view: { live: boolean; snapshotAt: number },
  confirmed: ReadonlySet<string>,
): DayTotals {
  const total = { ...server };
  const onDay = (tx: { dateBs: string }) => tx.dateBs === dateBs;
  for (const row of local) {
    if (row.type === "party.create" || !notYetOnServer(row, view, confirmed)) continue;
    if (row.type === "tx.create") {
      if (onDay(row.payload)) add(total, { ...row.payload, status: "active" }, 1);
      continue;
    }
    if (row.status === "failed") continue; // the server refused the change: its numbers stand
    if (onDay(row.before)) add(total, { ...row.before, status: "active" }, -1);
    if (row.type === "tx.correct" && onDay(row.payload))
      add(total, { ...row.payload, status: "active" }, 1);
  }
  return total;
}
