import { searchParties } from "@mero-pasal/shared/names";
import { isLocalParty } from "../capture/local-party";
import type { PickerParty } from "../capture/use-picker-parties";

export type AccountTab = "customers" | "suppliers";
export type MonthTotal = { billCount: number; salePaisa: number; purchasePaisa: number };
export type AccountRow = {
  party: PickerParty;
  /** This BS month: sales for customers, purchases for suppliers. */
  monthPaisa: number;
  monthCount: number;
  /** Added on this phone, not on the server yet (no account page until it syncs). */
  local: boolean;
};

/**
 * F-07 accounts list rows: busiest this month first, then most recently used; while searching,
 * the name search's own order (ADR-012, names only per ADR-029).
 */
export function accountRows(
  parties: readonly PickerParty[],
  totals: ReadonlyMap<string, MonthTotal>,
  tab: AccountTab,
  query: string,
): AccountRow[] {
  const toRow = (party: PickerParty): AccountRow => {
    const month = totals.get(party._id);
    return {
      party,
      monthPaisa: (tab === "customers" ? month?.salePaisa : month?.purchasePaisa) ?? 0,
      monthCount: month?.billCount ?? 0,
      local: isLocalParty(party),
    };
  };
  if (query.trim()) return searchParties(query, parties).matches.map(toRow);
  return parties
    .map(toRow)
    .sort((a, b) => b.monthPaisa - a.monthPaisa || b.party.lastUsedAt - a.party.lastUsedAt);
}
