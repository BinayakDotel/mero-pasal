"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import { useMemo } from "react";
import {
  type BillItem,
  fromServer,
  localBills,
  mergeBills,
  nameBook,
} from "@/features/bills/bill-item";
import { useSync } from "@/features/sync/sync-provider";
import { useCachedQuery } from "@/features/sync/use-cached-query";
import { useOutboxRows } from "@/features/sync/use-outbox-rows";
import { type DayTotals, mergeTotals, notYetOnServer } from "./merge-today";

/**
 * F-02 Today, M2: server totals and recent bills (live, or the last copy on the phone when
 * offline) plus the bills still waiting on the phone, each counted exactly once.
 */
export function useTodayBills(dateBs: string): {
  totals: DayTotals | undefined;
  recent: BillItem[] | undefined;
  live: boolean;
} {
  const totals = useCachedQuery(api.summaries.forDate, { dateBs }, `summaries.forDate:${dateBs}`);
  const recent = useCachedQuery(
    api.transactions.listRecentForDate,
    { dateBs, limit: 5 },
    `transactions.listRecentForDate:${dateBs}`,
  );
  const parties = useCachedQuery(api.parties.listForPicker, {}, "parties.listForPicker");
  const rows = useOutboxRows();
  const { engine } = useSync();

  return useMemo(() => {
    const view = { live: totals.live, snapshotAt: totals.savedAt };
    const mergedTotals =
      totals.data && mergeTotals(totals.data, rows, dateBs, view, engine.confirmed);

    const recentView = { live: recent.live, snapshotAt: recent.savedAt };
    const local = localBills(
      rows,
      nameBook(parties.data ?? [], rows),
      (r) => r.payload.dateBs === dateBs && notYetOnServer(r, recentView, engine.confirmed),
    );
    const server = (recent.data ?? []).map(fromServer);
    return {
      totals: mergedTotals,
      recent:
        recent.data === undefined && local.length === 0
          ? undefined
          : mergeBills(server, local).slice(0, 5),
      live: totals.live && recent.live,
    };
  }, [totals, recent, parties.data, rows, dateBs, engine.confirmed]);
}
