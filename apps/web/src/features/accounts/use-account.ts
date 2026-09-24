"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { useMemo } from "react";
import { fromServer, localBills, mergeBills, nameBook } from "@/features/bills/bill-item";
import { useCachedPaginatedQuery } from "@/features/sync/use-cached-paginated-query";
import { useCachedQuery } from "@/features/sync/use-cached-query";
import { useOutboxRows } from "@/features/sync/use-outbox-rows";

/**
 * F-07 account page data: the account with this month's and all-time totals, and its bills
 * (optionally one month), plus the account's bills still waiting on the phone.
 */
export function useAccount(partyId: Id<"parties">, thisMonth: string, month: string | null) {
  const account = useCachedQuery(
    api.parties.get,
    { id: partyId, monthBs: thisMonth },
    `parties.get:${partyId}:${thisMonth}`,
  );
  const pages = useCachedPaginatedQuery(
    api.transactions.listByParty,
    { partyId, ...(month ? { monthBs: month } : {}) },
    `transactions.listByParty:${partyId}:${month ?? "all"}`,
  );
  const parties = useCachedQuery(api.parties.listForPicker, {}, "parties.listForPicker");
  const rows = useOutboxRows();

  const bills = useMemo(() => {
    const local = localBills(
      rows,
      nameBook(parties.data ?? [], rows),
      (r) =>
        r.status !== "done" &&
        r.payload.partyRef !== undefined &&
        "id" in r.payload.partyRef &&
        r.payload.partyRef.id === partyId &&
        (month === null || r.payload.dateBs.startsWith(`${month}-`)),
    );
    if (pages.results === undefined && local.length === 0) return undefined;
    return mergeBills((pages.results ?? []).map(fromServer), local);
  }, [pages.results, parties.data, rows, partyId, month]);

  return {
    account: account.data,
    live: account.live && pages.live,
    bills,
    canLoadMore: pages.canLoadMore,
    loadMore: pages.loadMore,
  };
}
