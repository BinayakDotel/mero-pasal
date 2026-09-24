import { type DateLocale, diffDaysBs, formatBs } from "@mero-pasal/shared/dates";
import type { BillItem } from "./bill-item";

/**
 * ui-ux §5.5 sticky list headers: "आज · ७ असोज", "हिजो · ६ असोज", "मङ्गलबार · ५ असोज" within
 * the week, then "२ असोज" (with the year once it's another year).
 */
export function dayHeader(
  dateBs: string,
  todayBs: string,
  locale: DateLocale,
  words: { today: string; yesterday: string },
): string {
  const days = diffDaysBs(dateBs, todayBs);
  const dayMonth = formatBs(dateBs, locale, "dayMonth");
  if (days === 0) return `${words.today} · ${dayMonth}`;
  if (days === 1) return `${words.yesterday} · ${dayMonth}`;
  if (days > 1 && days < 7) {
    const [weekday] = formatBs(dateBs, locale, "weekdayDayMonth").split(", ");
    return `${weekday} · ${dayMonth}`;
  }
  return dateBs.slice(0, 4) === todayBs.slice(0, 4) ? dayMonth : formatBs(dateBs, locale, "long");
}

/** Consecutive bills of the same BS date, in list order (the list is already newest first). */
export function groupByDay(bills: readonly BillItem[]): { dateBs: string; bills: BillItem[] }[] {
  const groups: { dateBs: string; bills: BillItem[] }[] = [];
  for (const bill of bills) {
    const last = groups.at(-1);
    if (last?.dateBs === bill.dateBs) last.bills.push(bill);
    else groups.push({ dateBs: bill.dateBs, bills: [bill] });
  }
  return groups;
}
