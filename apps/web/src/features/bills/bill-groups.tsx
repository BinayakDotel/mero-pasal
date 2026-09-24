"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "@/features/session/locale";
import { useTodayBs } from "@/features/today/use-today-bs";
import type { BillItem } from "./bill-item";
import { BillRow } from "./bill-row";
import { dayHeader, groupByDay } from "./day-groups";

/**
 * F-06 list body: skeleton while loading, the empty message, or bills under sticky BS day
 * headers; asks for the next page when the end comes near.
 */
export function BillGroups({
  bills,
  empty,
  canLoadMore = false,
  loadMore,
}: {
  bills: BillItem[] | undefined;
  empty: string;
  canLoadMore?: boolean;
  loadMore?: () => void;
}) {
  const { locale, t } = useLocale();
  const today = useTodayBs();
  const words = { today: t("date.today"), yesterday: t("date.yesterday") };

  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = end.current;
    if (!node || !canLoadMore || !loadMore) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && loadMore(),
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, loadMore]);

  if (bills === undefined) {
    return (
      <div aria-busy="true" className="animate-pulse motion-reduce:animate-none">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="h-[70px] border-b border-rule" />
        ))}
      </div>
    );
  }
  if (bills.length === 0) return <p className="px-5 py-7 text-center text-ink-soft">{empty}</p>;
  return (
    <>
      {groupByDay(bills).map((group) => (
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
      ))}
      <div ref={end} aria-hidden="true" />
    </>
  );
}
