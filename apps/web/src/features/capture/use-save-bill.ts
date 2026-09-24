"use client";

import { todayBs } from "@mero-pasal/shared/dates";
import { useCallback } from "react";
import { getDb } from "@/features/sync/db";
import type { NewOutboxItem, NewPage } from "@/features/sync/outbox";
import { enqueueDurable, StorageFullError } from "@/features/sync/outbox-store";
import { PhotoUnreadableError } from "@/features/sync/photo-bytes";
import { useSync } from "@/features/sync/sync-provider";
import { digitsToPaisa } from "./amount-entry";
import { useCapture } from "./capture-provider";
import { UnreadablePhotoError } from "./image/process-image";

export type SaveResult = "saved" | "full" | "unreadable" | "failed";

/**
 * F-03 Save, M2 (NFR-02): turn the draft into outbox items (a new name first, then the bill) and
 * store them on the phone in one transaction. The stamp shows as soon as that transaction commits,
 * online or not; the sync engine sends them when it can (F-09).
 * `withAmount = false` is "रकम पछि हाल्छु". The date defaults to today in NPT at the moment of saving.
 */
export function useSaveBill() {
  const { state, dispatch, processed } = useCapture();
  const { owner } = useSync();

  return useCallback(
    async (withAmount: boolean): Promise<SaveResult> => {
      if (state.step !== "amount" || !owner) return "failed";
      dispatch({ type: "saveStart" });
      try {
        // Every page's upload-ready version must exist before the transaction opens.
        const pages: NewPage[] = [];
        for (const page of state.pages) {
          const photo = await processed(page.id);
          pages.push({
            full: photo.full,
            thumb: photo.thumb,
            width: photo.width,
            height: photo.height,
            bytes: photo.bytes,
          });
        }

        const now = Date.now();
        const items: NewOutboxItem[] = [];
        const { party } = state;
        if (party.type === "new") {
          items.push({
            type: "party.create",
            clientId: party.clientId,
            createdAt: now,
            attempts: 0,
            payload: {
              name: party.displayName,
              kind: state.kind === "sale" ? "customer" : "supplier",
              ...(party.phone ? { phone: party.phone } : {}),
              ...(party.tag ? { tag: party.tag } : {}),
            },
          });
        }
        const amountPaisa = withAmount ? digitsToPaisa(state.digits) : undefined;
        items.push({
          type: "tx.create",
          clientId: state.clientId,
          createdAt: now,
          attempts: 0,
          payload: {
            kind: state.kind,
            ...(party.type === "existing" ? { partyRef: { id: party.id } } : {}),
            ...(party.type === "new" || party.type === "local"
              ? { partyRef: { clientId: party.clientId } }
              : {}),
            dateBs: state.dateBs ?? todayBs(now),
            ...(amountPaisa === undefined ? {} : { amountPaisa }),
            clientCapturedAt: state.startedAt,
          },
          pages,
        });

        await enqueueDurable(getDb(), items, owner, now);
        dispatch({ type: "saved" });
        return "saved";
      } catch (error) {
        dispatch({ type: "saveFailed" });
        if (error instanceof StorageFullError) return "full";
        // Can't be decoded, or (an older draft) can't be read back from the phone: retake it.
        if (error instanceof UnreadablePhotoError || error instanceof PhotoUnreadableError)
          return "unreadable";
        return "failed";
      }
    },
    [state, dispatch, processed, owner],
  );
}
