"use client";

import { useCallback } from "react";
import { enqueueRemove, undoRemove } from "@/features/sync/bill-edits";
import { getDb } from "@/features/sync/db";
import { useSync } from "@/features/sync/sync-provider";
import type { BillDetail } from "./use-bill-detail";

/**
 * F-08 remove through the phone's outbox: it goes after the 6 s undo window, so फर्काउनुहोस्
 * simply takes it back out of the queue. `remove` returns the id `undo` needs (null = failed).
 */
export function useRemoveBill(bill: BillDetail | null | undefined) {
  const { owner } = useSync();
  const remove = useCallback(async (): Promise<string | null> => {
    if (!bill || !owner) return null;
    try {
      return await enqueueRemove(
        getDb(),
        bill.clientId,
        {
          kind: bill.kind,
          dateBs: bill.dateBs,
          ...(bill.partyId === undefined ? {} : { partyId: bill.partyId }),
          ...(bill.partyName === undefined ? {} : { partyName: bill.partyName }),
          ...(bill.amountPaisa === undefined ? {} : { amountPaisa: bill.amountPaisa }),
        },
        owner,
        Date.now(),
      );
    } catch {
      return null;
    }
  }, [bill, owner]);
  const undo = useCallback((removalId: string) => undoRemove(getDb(), removalId), []);
  return { remove, undo };
}
