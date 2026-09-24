"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import { useEffect, useMemo, useState } from "react";
import { useMember } from "@/features/session/member-gate";
import { useCachedQuery } from "@/features/sync/use-cached-query";
import { useOutboxRows } from "@/features/sync/use-outbox-rows";
import { localBills, nameBook } from "./bill-item";

export type BillDetail = {
  kind: "sale" | "purchase";
  status: "active" | "deleted";
  dateBs: string;
  partyId?: string;
  partyName?: string;
  isWalkIn: boolean;
  amountPaisa?: number;
  billNumber?: string;
  capturedAt: number;
  capturedByName: string;
  /** Full-size photo per page (a blob URL while the bill is still on the phone). */
  photos: (string | null)[];
  pending: boolean;
};

/** Object URLs for the phone's own photos, revoked when they change or the screen closes. */
function useBlobUrls(blobs: readonly Blob[] | undefined): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const made = (blobs ?? []).map((b) => URL.createObjectURL(b));
    setUrls(made);
    return () => {
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, [blobs]);
  return urls;
}

/**
 * F-08 bill detail by clientId: the server's copy (live, or saved on the phone offline), else
 * the bill still waiting in the phone's outbox. `null` = not found.
 */
export function useBillDetail(clientId: string): BillDetail | null | undefined {
  const server = useCachedQuery(api.transactions.get, { clientId }, `transactions.get:${clientId}`);
  const parties = useCachedQuery(api.parties.listForPicker, {}, "parties.listForPicker");
  const rows = useOutboxRows();
  const { member } = useMember();
  const outbox = useMemo(
    () => rows.find((r) => r.type === "tx.create" && r.clientId === clientId),
    [rows, clientId],
  );
  const localPhotos = useMemo(
    () => (outbox?.type === "tx.create" ? outbox.pages.map((p) => p.full) : undefined),
    [outbox],
  );
  const localUrls = useBlobUrls(server.data ? undefined : localPhotos);

  return useMemo(() => {
    const s = server.data;
    if (s) {
      return {
        kind: s.kind,
        status: s.status,
        dateBs: s.dateBs,
        ...(s.partyId === undefined ? {} : { partyId: s.partyId }),
        ...(s.partyName === undefined ? {} : { partyName: s.partyName }),
        isWalkIn: s.isWalkIn,
        ...(s.amountPaisa === undefined ? {} : { amountPaisa: s.amountPaisa }),
        ...(s.billNumber === undefined ? {} : { billNumber: s.billNumber }),
        capturedAt: s.capturedAt,
        capturedByName: s.capturedByName,
        photos: s.photos.map((p) => p.url ?? p.thumbUrl),
        pending: false,
      };
    }
    if (outbox) {
      const [item] = localBills([outbox], nameBook(parties.data ?? [], rows), () => true);
      if (!item) return null;
      return {
        kind: item.kind,
        status: "active",
        dateBs: item.dateBs,
        ...(item.partyId === undefined ? {} : { partyId: item.partyId }),
        ...(item.partyName === undefined ? {} : { partyName: item.partyName }),
        isWalkIn: item.isWalkIn,
        ...(item.amountPaisa === undefined ? {} : { amountPaisa: item.amountPaisa }),
        capturedAt: item.capturedAt,
        capturedByName: member.displayName,
        photos: localUrls,
        pending: item.pending,
      };
    }
    return s === null ? null : undefined;
  }, [server.data, outbox, parties.data, rows, member.displayName, localUrls]);
}
