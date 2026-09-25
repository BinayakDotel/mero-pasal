import { daysInMonthBs, isValidBs } from "@mero-pasal/shared/dates";

/** The first and last BS day of a month ("2083-06" → 2083-06-01 … 2083-06-30). */
export function monthRange(monthBs: string): { fromBs: string; toBs: string } {
  const [year, month] = monthBs.split("-").map(Number) as [number, number];
  const last = String(daysInMonthBs(year, month)).padStart(2, "0");
  return { fromBs: `${monthBs}-01`, toBs: `${monthBs}-${last}` };
}

/**
 * The typed From/To boxes as query args: empty means open-ended; anything else must be a real
 * BS date, and From can't be after To. `null` = not usable yet (the table keeps the last range).
 */
export function rangeArgs(from: string, to: string): { fromBs?: string; toBs?: string } | null {
  const f = from.trim();
  const t = to.trim();
  if ((f && !isValidBs(f)) || (t && !isValidBs(t))) return null;
  if (f && t && f > t) return null;
  return { ...(f ? { fromBs: f } : {}), ...(t ? { toBs: t } : {}) };
}
