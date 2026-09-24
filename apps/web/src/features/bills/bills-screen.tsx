"use client";

import { Chip } from "@mero-pasal/ui/components/chip";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/features/session/locale";
import { BillGroups } from "./bill-groups";
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
  const { t } = useLocale();
  const [filter, setFilter] = useState<BillFilter>("all");
  const list = useBillList(filter);
  const [query, setQuery] = useState<string | null>(null); // null = not searching
  const found = useBillSearch(query ?? "");
  const searching = query !== null && query.trim() !== "";
  const bills = searching ? found : list.bills;
  const { live, canLoadMore, loadMore } = list;

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

      <BillGroups
        bills={bills}
        empty={searching ? t("bills.searchEmpty", { q: query.trim() }) : t("bills.empty")}
        canLoadMore={canLoadMore && !searching}
        loadMore={loadMore}
      />
    </main>
  );
}
