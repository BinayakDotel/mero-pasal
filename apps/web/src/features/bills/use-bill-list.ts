"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import { useMemo } from "react";
import { useCachedPaginatedQuery } from "@/features/sync/use-cached-paginated-query";
import { useCachedQuery } from "@/features/sync/use-cached-query";
import { useOutboxRows } from "@/features/sync/use-outbox-rows";
import { type BillItem, fromServer, localBills, mergeBills, nameBook } from "./bill-item";

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

  const bills = useMemo((): BillItem[] | undefined => {
    const local = localBills(
      rows,
      nameBook(parties.data ?? [], rows),
      (r) =>
        r.status !== "done" &&
        (filter === "all" ||
          (filter === "noAmount"
            ? r.payload.amountPaisa === undefined
            : r.payload.kind === filter)),
    );
    if (pages.results === undefined && local.length === 0) return undefined;
    return mergeBills((pages.results ?? []).map(fromServer), local);
  }, [pages.results, parties.data, rows, filter]);

  return { bills, live: pages.live, canLoadMore: pages.canLoadMore, loadMore: pages.loadMore };
}
