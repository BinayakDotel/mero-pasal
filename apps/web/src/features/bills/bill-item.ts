import type { api } from "@mero-pasal/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { OutboxRow } from "@/features/sync/db";
import { notYetOnServer } from "../today/merge-today";

/** One bill as a list shows it (Today, Bills, an account), from the server or the phone. */
export type BillItem = {
  key: string;
  clientId: string;
  kind: "sale" | "purchase";
  dateBs: string;
  partyId?: string;
  partyName?: string;
  isWalkIn: boolean;
  amountPaisa?: number;
  capturedAt: number;
  thumb: { url: string } | { blob: Blob } | null;
  /** Still waiting on the phone (F-09 clock mark). */
  pending: boolean;
};

export type ServerBill = FunctionReturnType<typeof api.transactions.listRecentForDate>[number];

export function fromServer(b: ServerBill): BillItem {
  return {
    key: b._id,
    clientId: b.clientId,
    kind: b.kind,
    dateBs: b.dateBs,
    ...(b.partyId === undefined ? {} : { partyId: b.partyId }),
    ...(b.partyName === undefined ? {} : { partyName: b.partyName }),
    isWalkIn: b.isWalkIn,
    ...(b.amountPaisa === undefined ? {} : { amountPaisa: b.amountPaisa }),
    capturedAt: b.capturedAt,
    thumb: b.thumbUrl ? { url: b.thumbUrl } : null,
    pending: false,
  };
}

/** The names a phone-side bill can point at: synced accounts, plus names added on the phone. */
export type NameBook = {
  byId: Map<string, { displayName: string; isWalkIn: boolean }>;
  byClientId: Map<string, { _id: string; displayName: string; isWalkIn: boolean }>;
};

export function nameBook(
  parties: readonly { _id: string; clientId: string; displayName: string; isWalkIn: boolean }[],
  rows: readonly OutboxRow[],
): NameBook {
  const byId: NameBook["byId"] = new Map(parties.map((p) => [p._id, p]));
  const byClientId: NameBook["byClientId"] = new Map(parties.map((p) => [p.clientId, p]));
  for (const r of rows) {
    if (r.type === "party.create" && !byClientId.has(r.clientId)) {
      byClientId.set(r.clientId, { _id: "", displayName: r.payload.name, isWalkIn: false });
    }
  }
  return { byId, byClientId };
}

/** Bills in the phone's outbox that `include` accepts, as list items (thumbnail from the blob). */
export function localBills(
  rows: readonly OutboxRow[],
  names: NameBook,
  include: (row: Extract<OutboxRow, { type: "tx.create" }>) => boolean,
): BillItem[] {
  return rows.flatMap((r) => {
    if (r.type !== "tx.create" || !include(r)) return [];
    const ref = r.payload.partyRef;
    const party = ref
      ? "id" in ref
        ? { ...names.byId.get(ref.id), _id: ref.id }
        : names.byClientId.get(ref.clientId)
      : undefined;
    const partyId = party?._id || undefined;
    const thumb = r.pages[0]?.thumb;
    return [
      {
        key: `local:${r.clientId}`,
        clientId: r.clientId,
        kind: r.payload.kind,
        dateBs: r.payload.dateBs,
        ...(partyId === undefined ? {} : { partyId }),
        ...(party?.displayName === undefined ? {} : { partyName: party.displayName }),
        isWalkIn: party?.isWalkIn ?? false,
        ...(r.payload.amountPaisa === undefined ? {} : { amountPaisa: r.payload.amountPaisa }),
        capturedAt: r.payload.clientCapturedAt ?? r.createdAt,
        thumb: thumb && thumb.size > 0 ? { blob: thumb } : null,
        pending: r.status !== "done",
      },
    ];
  });
}

/** Server rows win over phone rows with the same clientId; newest date, then time, first. */
export function mergeBills(server: readonly BillItem[], local: readonly BillItem[]): BillItem[] {
  const onServer = new Set(server.map((s) => s.clientId));
  return [...server, ...local.filter((l) => !onServer.has(l.clientId))].sort(
    (a, b) => b.dateBs.localeCompare(a.dateBs) || b.capturedAt - a.capturedAt,
  );
}

/** A correction or removal the server hasn't applied yet (a refused one no longer counts). */
const inFlight = (r: OutboxRow) => r.status === "pending" || r.status === "uploading";

/**
 * The same "not in these numbers yet" rule as Today's totals, for a list shown from `view`:
 * live → not yet confirmed; a saved copy → also changes finished after it was saved.
 */
export function editsNotIn(
  view: { live: boolean; snapshotAt: number },
  confirmed: ReadonlySet<string>,
): (row: OutboxRow) => boolean {
  return (r) => r.status !== "failed" && notYetOnServer(r, view, confirmed);
}

/**
 * F-08 on the phone: bills with a removal on its way disappear; bills with a correction on its
 * way show the new values (clock mark). The latest correction wins (rows are in queue order).
 */
export function applyEdits(
  bills: readonly BillItem[],
  rows: readonly OutboxRow[],
  names: NameBook,
  /** Which changes the shown data doesn't include yet (default: those still on their way). */
  notIn: (row: OutboxRow) => boolean = inFlight,
): BillItem[] {
  const removed = new Set<string>();
  const corrected = new Map<string, Extract<OutboxRow, { type: "tx.correct" }>>();
  for (const r of rows) {
    if (!notIn(r)) continue;
    if (r.type === "tx.remove") removed.add(r.payload.billClientId);
    if (r.type === "tx.correct") corrected.set(r.payload.billClientId, r);
  }
  return bills
    .filter((b) => !removed.has(b.clientId))
    .map((b) => {
      const c = corrected.get(b.clientId)?.payload;
      if (!c) return b;
      const ref = c.partyRef;
      const party = ref
        ? "id" in ref
          ? { ...names.byId.get(ref.id), _id: ref.id }
          : names.byClientId.get(ref.clientId)
        : undefined;
      const { partyId: _id, partyName: _name, amountPaisa: _amount, ...rest } = b;
      return {
        ...rest,
        kind: c.kind,
        dateBs: c.dateBs,
        ...(party?._id ? { partyId: party._id } : {}),
        ...(party?.displayName === undefined ? {} : { partyName: party.displayName }),
        isWalkIn: party?.isWalkIn ?? false,
        ...(c.amountPaisa === undefined ? {} : { amountPaisa: c.amountPaisa }),
        pending: true,
      };
    });
}
