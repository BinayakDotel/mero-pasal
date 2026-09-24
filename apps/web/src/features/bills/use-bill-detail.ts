"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import { useEffect, useMemo, useState } from "react";
import { useMember } from "@/features/session/member-gate";
import type { OutboxRow } from "@/features/sync/db";
import { isV1Page } from "@/features/sync/outbox";
import { useSync } from "@/features/sync/sync-provider";
import { useCachedQuery } from "@/features/sync/use-cached-query";
import { useOutboxRows } from "@/features/sync/use-outbox-rows";
import { usePhotos } from "@/features/sync/use-photo";
import {
  applyEdits,
  type BillItem,
  editsNotIn,
  localBills,
  type NameBook,
  nameBook,
} from "./bill-item";

export type BillDetail = {
  clientId: string;
  kind: "sale" | "purchase";
  status: "active" | "deleted";
  dateBs: string;
  partyId?: string;
  partyName?: string;
  isWalkIn: boolean;
  amountPaisa?: number;
  billNumber?: string;
  capturedAt: number;
  /** The member who took it (for the F-08 staff rule), when the server knows. */
  capturedBy?: string;
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

/** F-08 on the phone: a removal on its way shows as removed; a correction shows its values. */
export function withEdits(
  bill: BillDetail,
  rows: readonly OutboxRow[],
  names: NameBook,
  notIn: (row: OutboxRow) => boolean,
): BillDetail {
  const item: BillItem = { ...bill, key: bill.clientId, thumb: null };
  const [edited] = applyEdits([item], rows, names, notIn);
  if (!edited) return { ...bill, status: "deleted", pending: true };
  if (edited === item) return bill;
  const { partyId: _id, partyName: _name, amountPaisa: _amount, ...rest } = bill;
  return {
    ...rest,
    kind: edited.kind,
    dateBs: edited.dateBs,
    ...(edited.partyId === undefined ? {} : { partyId: edited.partyId }),
    ...(edited.partyName === undefined ? {} : { partyName: edited.partyName }),
    isWalkIn: edited.isWalkIn,
    ...(edited.amountPaisa === undefined ? {} : { amountPaisa: edited.amountPaisa }),
    pending: true,
  };
}

/**
 * F-08 bill detail by clientId: the server's copy (live, or saved on the phone offline), else
 * the bill still waiting in the phone's outbox, with corrections and removals on their way
 * applied. `null` = not found.
 */
export function useBillDetail(clientId: string): BillDetail | null | undefined {
  const server = useCachedQuery(api.transactions.get, { clientId }, `transactions.get:${clientId}`);
  const parties = useCachedQuery(api.parties.listForPicker, {}, "parties.listForPicker");
  const rows = useOutboxRows();
  const { member } = useMember();
  const { engine } = useSync();
  const outbox = useMemo(
    () => rows.find((r) => r.type === "tx.create" && r.clientId === clientId),
    [rows, clientId],
  );
  // Load the phone's photos only when the server doesn't have the bill (architecture §9).
  const fullRefs = useMemo(
    () =>
      !server.data && outbox?.type === "tx.create" && !outbox.photosGone
        ? outbox.pages.flatMap((p) => (isV1Page(p) ? [] : [p.fullRef]))
        : [],
    [outbox, server.data],
  );
  const loaded = usePhotos(fullRefs);
  const localPhotos = useMemo(
    () => (loaded.every((b): b is Blob => b !== null) && loaded.length ? loaded : undefined),
    [loaded],
  );
  const localUrls = useBlobUrls(server.data ? undefined : localPhotos);

  return useMemo(() => {
    const names = nameBook(parties.data ?? [], rows);
    // A bill only on the phone is compared like live data: its changes are all still to come.
    const notIn = editsNotIn(
      { live: server.live || !server.data, snapshotAt: server.savedAt },
      engine.confirmed,
    );
    const s = server.data;
    if (s) {
      return withEdits(
        {
          clientId,
          kind: s.kind,
          status: s.status,
          dateBs: s.dateBs,
          ...(s.partyId === undefined ? {} : { partyId: s.partyId }),
          ...(s.partyName === undefined ? {} : { partyName: s.partyName }),
          isWalkIn: s.isWalkIn,
          ...(s.amountPaisa === undefined ? {} : { amountPaisa: s.amountPaisa }),
          ...(s.billNumber === undefined ? {} : { billNumber: s.billNumber }),
          capturedAt: s.capturedAt,
          capturedBy: s.capturedBy,
          capturedByName: s.capturedByName,
          photos: s.photos.map((p) => p.url ?? p.thumbUrl),
          pending: false,
        },
        rows,
        names,
        notIn,
      );
    }
    if (outbox) {
      const [item] = localBills([outbox], names, () => true);
      if (!item) return null;
      return withEdits(
        {
          clientId,
          kind: item.kind,
          status: "active",
          dateBs: item.dateBs,
          ...(item.partyId === undefined ? {} : { partyId: item.partyId }),
          ...(item.partyName === undefined ? {} : { partyName: item.partyName }),
          isWalkIn: item.isWalkIn,
          ...(item.amountPaisa === undefined ? {} : { amountPaisa: item.amountPaisa }),
          capturedAt: item.capturedAt,
          capturedBy: member._id,
          capturedByName: member.displayName,
          photos: localUrls,
          pending: item.pending,
        },
        rows,
        names,
        notIn,
      );
    }
    return s === null ? null : undefined;
  }, [server, outbox, parties.data, rows, member, localUrls, clientId, engine.confirmed]);
}
