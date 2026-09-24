"use client";

import { Chip } from "@mero-pasal/ui/components/chip";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/features/session/locale";
import { useTodayBs } from "@/features/today/use-today-bs";
import { BillRow } from "./bill-row";
import { dayHeader, groupByDay } from "./day-groups";
import { type BillFilter, useBillList } from "./use-bill-list";
import { useBillSearch } from "./use-bill-search";

const FILTERS = [
  ["all", "filter.all"],
  ["sale", "kind.sale"],
  ["purchase", "kind.purchase"],
  ["noAmount", "bill.noAmount"],
] as const satisfies readonly (readonly [BillFilter, string])[];

/** F-06 / ui-ux §5.5: every bill, newest day first, filter chips, more as he scrolls. */
export function BillsScreen() {
  const { locale, t } = useLocale();
  const today = useTodayBs();
  const [filter, setFilter] = useState<BillFilter>("all");
  const list = useBillList(filter);
  const [query, setQuery] = useState<string | null>(null); // null = not searching
  const found = useBillSearch(query ?? "");
  const searching = query !== null && query.trim() !== "";
  const bills = searching ? found : list.bills;
  const { live, canLoadMore, loadMore } = list;
  const words = { today: t("date.today"), yesterday: t("date.yesterday") };

  // Load the next page when the end of the list comes near.
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = end.current;
    if (!node || !canLoadMore || searching) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && loadMore(),
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, loadMore, searching]);

  return (
    <main className="flex-1 pb-4">
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h1 className="flex-1 font-display text-[30px] leading-tight font-extrabold">
          {t("nav.bills")}
          {live ? "" : ` ${t("sync.stale")}`}
        </h1>
        <button
          type="button"
          aria-label={query === null ? t("party.search") : t("common.close")}
          aria-expanded={query !== null}
          onClick={() => setQuery(query === null ? "" : null)}
          className="grid size-12 place-items-center rounded-full border-2 border-rule bg-card"
        >
          <Icon name={query === null ? "search" : "close"} />
        </button>
      </header>
      {query === null ? (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          {FILTERS.map(([value, label]) => (
            <Chip key={value} selected={filter === value} onClick={() => setFilter(value)}>
              {t(label)}
            </Chip>
          ))}
        </div>
      ) : (
        <div className="px-4 pb-3">
          <input
            type="search"
            // biome-ignore lint/a11y/noAutofocus: he tapped search to type a name
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("party.search")}
            aria-label={t("party.search")}
            className="h-14 w-full rounded-xl border-2 border-rule bg-card px-4 text-[19px]"
          />
        </div>
      )}

      {bills === undefined ? (
        <div aria-busy="true" className="animate-pulse motion-reduce:animate-none">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="h-[70px] border-b border-rule" />
          ))}
        </div>
      ) : bills.length === 0 ? (
        <p className="px-5 py-7 text-center text-ink-soft">
          {searching ? t("bills.searchEmpty", { q: query.trim() }) : t("bills.empty")}
        </p>
      ) : (
        groupByDay(bills).map((group) => (
          <section key={group.dateBs}>
            <h2 className="sticky top-0 z-10 border-b border-rule bg-paper px-4 py-1.5 text-base font-bold text-ink-soft">
              {dayHeader(group.dateBs, today, locale, words)}
            </h2>
            <ul>
              {group.bills.map((bill) => (
                <BillRow key={bill.key} bill={bill} />
              ))}
            </ul>
          </section>
        ))
      )}
      <div ref={end} aria-hidden="true" />
    </main>
  );
}
