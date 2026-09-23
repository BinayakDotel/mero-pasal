"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { BillKind } from "@mero-pasal/shared/domain";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo } from "react";

export type PickerParty = FunctionReturnType<typeof api.parties.listForPicker>[number];

/**
 * F-04: the accounts the picker offers for a bill type (sale → customers, purchase → suppliers,
 * `both` in either), most recent first, with the walk-in account separated out.
 * M2 swaps this to the offline cache (useCachedQuery).
 */
export function usePickerParties(kind: BillKind) {
  const all = useQuery(api.parties.listForPicker, {});
  return useMemo(() => {
    if (all === undefined) return { loading: true as const, walkIn: null, parties: [] };
    const wanted = kind === "sale" ? "customer" : "supplier";
    return {
      loading: false as const,
      walkIn: all.find((p) => p.isWalkIn) ?? null,
      parties: all.filter((p) => !p.isWalkIn && (p.kind === wanted || p.kind === "both")),
    };
  }, [all, kind]);
}
