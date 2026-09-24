import { addDaysBs, type DateLocale, formatBs, monthOf } from "@mero-pasal/shared/dates";

/** This BS month and the ones before it, newest first: ["2083-06", "2083-05", …]. */
export function recentMonths(monthBs: string, count: number): string[] {
  const months = [monthBs];
  while (months.length < count) {
    const first = `${months.at(-1)}-01`;
    months.push(monthOf(addDaysBs(first, -1)));
  }
  return months;
}

/** "असोज २०८३" / "Asoj 2083". */
export function monthLabel(monthBs: string, locale: DateLocale): string {
  return formatBs(`${monthBs}-01`, locale, "long").split(" ").slice(1).join(" ");
}
