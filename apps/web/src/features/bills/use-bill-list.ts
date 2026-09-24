"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import { useMemo } from "react";
import { useSync } from "@/features/sync/sync-provider";
import { useCachedPaginatedQuery } from "@/features/sync/use-cached-paginated-query";
import { useCachedQuery } from "@/features/sync/use-cached-query";
import { useOutboxRows } from "@/features/sync/use-outbox-rows";
import {
  applyEdits,
  type BillItem,
  editsNotIn,
  fromServer,
  localBills,
  mergeBills,
  nameBook,
} from "./bill-item";

export type BillFilter = "all" | "sale" | "purchase" | "noAmount";

/**
 * F-06 Bills list: the server's pages (live, or the copy on the phone offline) plus bills still
 * waiting on the phone that match the filter, each shown once.
 */
export function useBillList(filter: BillFilter) {
  const pages = useCachedPaginatedQuery(
    api.transactions.listByDate,
    { filter },
    `transactions.listByDate:${filter}`,
  );
  const parties = useCachedQuery(api.parties.listForPicker, {}, "parties.listForPicker");
  const rows = useOutboxRows();
  const { engine } = useSync();

  const bills = useMemo((): BillItem[] | undefined => {
    const names = nameBook(parties.data ?? [], rows);
    const notIn = editsNotIn({ live: pages.live, snapshotAt: pages.savedAt }, engine.confirmed);
    const local = localBills(rows, names, (r) => r.status !== "done");
    if (pages.results === undefined && local.length === 0) return undefined;
    // Corrections on their way may change a bill's type or amount: filter after applying them.
    return mergeBills(
      applyEdits((pages.results ?? []).map(fromServer), rows, names, notIn),
      applyEdits(local, rows, names, notIn),
    ).filter(
      (b) =>
        filter === "all" ||
        (filter === "noAmount" ? b.amountPaisa === undefined : b.kind === filter),
    );
  }, [pages.results, pages.live, pages.savedAt, parties.data, rows, filter, engine.confirmed]);

  return { bills, live: pages.live, canLoadMore: pages.canLoadMore, loadMore: pages.loadMore };
}
