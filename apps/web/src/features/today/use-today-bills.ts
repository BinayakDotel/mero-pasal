"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import { useMemo } from "react";
import { useSync } from "@/features/sync/sync-provider";
import { useCachedQuery } from "@/features/sync/use-cached-query";
import { useOutboxRows } from "@/features/sync/use-outbox-rows";
import {
  type DayTotals,
  mergeRecent,
  mergeTotals,
  notYetOnServer,
  type RecentItem,
} from "./merge-today";

/**
 * F-02 Today, M2: server totals and recent bills (live, or the last copy on the phone when
 * offline) plus the bills still waiting on the phone, each counted exactly once.
 */
export function useTodayBills(dateBs: string): {
  totals: DayTotals | undefined;
  recent: RecentItem[] | undefined;
  live: boolean;
} {
  const totals = useCachedQuery(api.summaries.forDate, { dateBs }, `summaries.forDate:${dateBs}`);
  const recent = useCachedQuery(
    api.transactions.listRecentForDate,
    { dateBs, limit: 5 },
    `transactions.listRecentForDate:${dateBs}`,
  );
  const parties = useCachedQuery(api.parties.listForPicker, {}, "parties.listForPicker");
  const rows = useOutboxRows();
  const { engine } = useSync();

  return useMemo(() => {
    const view = { live: totals.live, snapshotAt: totals.savedAt };
    const mergedTotals =
      totals.data && mergeTotals(totals.data, rows, dateBs, view, engine.confirmed);

    const byId = new Map((parties.data ?? []).map((p) => [p._id as string, p]));
    const byClientId = new Map((parties.data ?? []).map((p) => [p.clientId, p]));
    const newNames = new Map(
      rows.flatMap((r) =>
        r.type === "party.create" ? [[r.clientId, r.payload.name] as const] : [],
      ),
    );
    const recentView = { live: recent.live, snapshotAt: recent.savedAt };
    const local: RecentItem[] = rows.flatMap((r) => {
      if (r.type !== "tx.create" || r.payload.dateBs !== dateBs) return [];
      if (!notYetOnServer(r, recentView, engine.confirmed)) return [];
      const ref = r.payload.partyRef;
      const party = ref
        ? "id" in ref
          ? byId.get(ref.id)
          : byClientId.get(ref.clientId)
        : undefined;
      const name =
        party?.displayName ?? (ref && "clientId" in ref ? newNames.get(ref.clientId) : undefined);
      const thumb = r.pages[0]?.thumb;
      return [
        {
          key: `local:${r.clientId}`,
          clientId: r.clientId,
          kind: r.payload.kind,
          ...(name === undefined ? {} : { partyName: name }),
          isWalkIn: party?.isWalkIn ?? false,
          ...(r.payload.amountPaisa === undefined ? {} : { amountPaisa: r.payload.amountPaisa }),
          capturedAt: r.payload.clientCapturedAt ?? r.createdAt,
          thumb: thumb && thumb.size > 0 ? { blob: thumb } : null,
          pending: r.status !== "done",
        },
      ];
    });
    const server: RecentItem[] = (recent.data ?? []).map((b) => ({
      key: b._id,
      clientId: b.clientId,
      kind: b.kind,
      ...(b.partyName === undefined ? {} : { partyName: b.partyName }),
      isWalkIn: b.isWalkIn,
      ...(b.amountPaisa === undefined ? {} : { amountPaisa: b.amountPaisa }),
      capturedAt: b.capturedAt,
      thumb: b.thumbUrl ? { url: b.thumbUrl } : null,
      pending: false,
    }));
    return {
      totals: mergedTotals,
      recent:
        recent.data === undefined && local.length === 0 ? undefined : mergeRecent(server, local, 5),
      live: totals.live && recent.live,
    };
  }, [totals, recent, parties.data, rows, dateBs, engine.confirmed]);
}
