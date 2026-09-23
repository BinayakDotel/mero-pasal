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

/** Today's totals: server totals plus the day's phone-side bills not yet counted there. */
export function mergeTotals(
  server: DayTotals,
  local: readonly OutboxRow[],
  dateBs: string,
  view: { live: boolean; snapshotAt: number },
  confirmed: ReadonlySet<string>,
): DayTotals {
  const total = { ...server };
  for (const row of local) {
    if (row.type !== "tx.create" || row.payload.dateBs !== dateBs) continue;
    if (!notYetOnServer(row, view, confirmed)) continue;
    const { daily } = contribution({
      kind: row.payload.kind,
      status: "active",
      dateBs: row.payload.dateBs,
      amountPaisa: row.payload.amountPaisa,
    });
    if (!daily) continue;
    for (const key of Object.keys(total) as (keyof DayTotals)[]) total[key] += daily.delta[key];
  }
  return total;
}

export type RecentItem = {
  key: string;
  clientId: string;
  kind: "sale" | "purchase";
  partyName?: string;
  isWalkIn: boolean;
  amountPaisa?: number;
  capturedAt: number;
  thumb: { url: string } | { blob: Blob } | null;
  pending: boolean;
};

/** The recent list: server rows win over phone rows with the same clientId; newest first. */
export function mergeRecent(
  server: readonly RecentItem[],
  local: readonly RecentItem[],
  limit: number,
): RecentItem[] {
  const onServer = new Set(server.map((s) => s.clientId));
  return [...server, ...local.filter((l) => !onServer.has(l.clientId))]
    .sort((a, b) => b.capturedAt - a.capturedAt)
    .slice(0, limit);
}
