"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { searchParties } from "@mero-pasal/shared/names";
import { useMemo } from "react";
import { useCachedQuery } from "@/features/sync/use-cached-query";
import { useOutboxRows } from "@/features/sync/use-outbox-rows";
import {
  applyEdits,
  type BillItem,
  fromServer,
  localBills,
  mergeBills,
  nameBook,
} from "./bill-item";

const MAX_ACCOUNTS = 5;

/**
 * F-06 search: names match on the phone across scripts (ADR-012; names only, ADR-029), then the
 * matched accounts' bills come from the server, plus any still waiting on the phone.
 */
export function useBillSearch(query: string): BillItem[] | undefined {
  const parties = useCachedQuery(api.parties.listForPicker, {}, "parties.listForPicker");
  const partyIds = useMemo(
    () =>
      query.trim() && parties.data
        ? searchParties(query, parties.data)
            .matches.slice(0, MAX_ACCOUNTS)
            .map((p) => p._id)
        : [],
    [query, parties.data],
  );
  const server = useCachedQuery(
    api.transactions.listForParties,
    { partyIds: partyIds as Id<"parties">[] },
    `transactions.listForParties:${partyIds.join(",")}`,
  );
  const rows = useOutboxRows();

  return useMemo(() => {
    if (!query.trim() || parties.data === undefined) return undefined;
    const wanted = new Set<string>(partyIds);
    const names = nameBook(parties.data, rows);
    const local = localBills(
      rows,
      names,
      (r) =>
        r.status !== "done" &&
        r.payload.partyRef !== undefined &&
        "id" in r.payload.partyRef &&
        wanted.has(r.payload.partyRef.id),
    );
    if (partyIds.length > 0 && server.data === undefined && local.length === 0) return undefined;
    const found = partyIds.length ? (server.data ?? []).map(fromServer) : [];
    return mergeBills(applyEdits(found, rows, names), applyEdits(local, rows, names));
  }, [query, partyIds, parties.data, server.data, rows]);
}
