import { type Matchable, searchParties } from "@mero-pasal/shared/names";

export type FilterableAccount = Matchable & {
  displayName: string;
  tag?: string;
  phone?: string;
  archived: boolean;
  mergedIntoId?: string;
  deletedAt?: number;
};

export type AccountFilter = {
  query: string;
  archived: boolean;
  merged: boolean;
  deleted: boolean;
};

const digits = (text: string) => text.replace(/\D/g, "");

/**
 * F-12 accounts table: hides archived, merged and deleted accounts unless asked (one still being
 * deleted stays, so its Retry can be seen). A query made only of
 * phone characters (3+ digits) finds phones; otherwise names in either script (the phone's F-04
 * search) or a tag (tags can hold digits: "Block 12").
 * With no query: by name.
 */
export function filterAccounts<T extends FilterableAccount>(
  rows: readonly T[],
  f: AccountFilter,
): T[] {
  const shown = rows.filter(
    (p) =>
      (f.archived || !p.archived) &&
      (f.merged || !p.mergedIntoId) &&
      (f.deleted || p.deletedAt === undefined),
  );
  const query = f.query.trim();
  if (!query) return [...shown].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const phone = digits(query);
  if (/^[\d\s+\-()]+$/.test(query) && phone.length >= 3)
    return shown.filter((p) => digits(p.phone ?? "").includes(phone));
  const byName = searchParties(query, shown).matches;
  const lower = query.toLowerCase();
  const byTag = shown.filter((p) => !byName.includes(p) && p.tag?.toLowerCase().includes(lower));
  return [...byName, ...byTag];
}
