"use client";

import { useCallback } from "react";
import { enqueueCorrect } from "@/features/sync/bill-edits";
import { getDb } from "@/features/sync/db";
import type { PartyCreateItem } from "@/features/sync/outbox";
import { StorageFullError } from "@/features/sync/outbox-store";
import { useSync } from "@/features/sync/sync-provider";
import type { Correction } from "./correct-flow";
import type { BillDetail } from "./use-bill-detail";

export type CorrectResult = "saved" | "full" | "failed";

/**
 * F-08 correct → the phone's outbox (ADR-011), like a bill: works offline. A name added while
 * correcting is queued first (a new account for the bill's type), then the correction.
 */
export function useCorrectBill(bill: BillDetail | null | undefined) {
  const { owner } = useSync();
  return useCallback(
    async (c: Correction): Promise<CorrectResult> => {
      if (!bill || !owner) return "failed";
      const now = Date.now();
      const party = c.party;
      const newParty: PartyCreateItem | undefined =
        party.type === "new"
          ? {
              type: "party.create",
              clientId: party.clientId,
              createdAt: now,
              attempts: 0,
              payload: {
                name: party.displayName,
                kind: c.kind === "sale" ? "customer" : "supplier",
                ...(party.phone ? { phone: party.phone } : {}),
                ...(party.tag ? { tag: party.tag } : {}),
              },
            }
          : undefined;
      const partyRef =
        party.type === "existing"
          ? { id: party.id }
          : party.type === "new" || party.type === "local"
            ? { clientId: party.clientId }
            : undefined;
      try {
        await enqueueCorrect(
          getDb(),
          bill.clientId,
          {
            kind: c.kind,
            dateBs: c.dateBs,
            ...(partyRef ? { partyRef } : {}),
            ...(c.amountPaisa === undefined ? {} : { amountPaisa: c.amountPaisa }),
          },
          {
            kind: bill.kind,
            dateBs: bill.dateBs,
            ...(bill.partyId === undefined ? {} : { partyId: bill.partyId }),
            ...(bill.partyName === undefined ? {} : { partyName: bill.partyName }),
            ...(bill.amountPaisa === undefined ? {} : { amountPaisa: bill.amountPaisa }),
          },
          owner,
          now,
          newParty,
        );
        return "saved";
      } catch (error) {
        return error instanceof StorageFullError ||
          (error as { name?: string }).name === "QuotaExceededError"
          ? "full"
          : "failed";
      }
    },
    [bill, owner],
  );
}
