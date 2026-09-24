"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { useMemo } from "react";
import {
  applyEdits,
  editsNotIn,
  fromServer,
  localBills,
  mergeBills,
  nameBook,
} from "@/features/bills/bill-item";
import { useSync } from "@/features/sync/sync-provider";
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
  const { engine } = useSync();

  const bills = useMemo(() => {
    const names = nameBook(parties.data ?? [], rows);
    const local = localBills(
      rows,
      names,
      // Any account: a correction on its way may move a phone-side bill into this one.
      (r) => r.status !== "done" && (month === null || r.payload.dateBs.startsWith(`${month}-`)),
    );
    const notIn = editsNotIn({ live: pages.live, snapshotAt: pages.savedAt }, engine.confirmed);
    // A correction on its way may move a bill between accounts: keep only this account's.
    const mine = (b: { partyId?: string }) => b.partyId === partyId;
    const localHere = applyEdits(local, rows, names, notIn).filter(mine);
    if (pages.results === undefined && localHere.length === 0) return undefined;
    return mergeBills(
      applyEdits((pages.results ?? []).map(fromServer), rows, names, notIn).filter(mine),
      localHere,
    );
  }, [pages.results, pages.live, pages.savedAt, parties.data, rows, partyId, month, engine]);

  return {
    account: account.data,
    live: account.live && pages.live,
    bills,
    canLoadMore: pages.canLoadMore,
    loadMore: pages.loadMore,
  };
}
