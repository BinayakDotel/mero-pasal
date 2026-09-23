"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import type { BillKind } from "@mero-pasal/shared/domain";
import { phoneticKey } from "@mero-pasal/shared/names";
import type { FunctionReturnType } from "convex/server";
import { useMemo } from "react";
import { useCachedQuery } from "@/features/sync/use-cached-query";
import { useOutboxRows } from "@/features/sync/use-outbox-rows";

export type PickerParty = FunctionReturnType<typeof api.parties.listForPicker>[number];

/** Names added on this phone that the server doesn't know yet carry this id prefix. */
export const LOCAL_PREFIX = "local:";
export const isLocalParty = (p: PickerParty) => (p._id as string).startsWith(LOCAL_PREFIX);

/**
 * F-04: the accounts the picker offers for a bill type (sale → customers, purchase → suppliers,
 * `both` in either), most recent first, with the walk-in account separated out. M2: works offline
 * from the last saved list, and includes names added on this phone that are still waiting to be
 * sent, so they can be picked again right away.
 */
export function usePickerParties(kind: BillKind) {
  const { data: all, live } = useCachedQuery(
    api.parties.listForPicker,
    {},
    "parties.listForPicker",
  );
  const rows = useOutboxRows();
  return useMemo(() => {
    if (all === undefined) return { loading: true as const, walkIn: null, parties: [], live };
    const known = new Set(all.map((p) => p.clientId));
    const local: PickerParty[] = rows.flatMap((r) =>
      r.type === "party.create" && r.status !== "failed" && !known.has(r.clientId)
        ? [
            {
              _id: `${LOCAL_PREFIX}${r.clientId}` as Id<"parties">,
              clientId: r.clientId,
              kind: r.payload.kind,
              displayName: r.payload.name,
              ...(r.payload.tag ? { tag: r.payload.tag } : {}),
              phoneticKey: phoneticKey(r.payload.name),
              isWalkIn: false,
              lastUsedAt: r.createdAt,
            },
          ]
        : [],
    );
    const wanted = kind === "sale" ? "customer" : "supplier";
    return {
      loading: false as const,
      walkIn: all.find((p) => p.isWalkIn) ?? null,
      parties: [...local, ...all]
        .filter((p) => !p.isWalkIn && (p.kind === wanted || p.kind === "both"))
        .sort((a, b) => b.lastUsedAt - a.lastUsedAt),
      live,
    };
  }, [all, rows, kind, live]);
}
