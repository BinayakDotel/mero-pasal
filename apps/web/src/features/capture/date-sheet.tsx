"use client";

import {
  addDaysBs,
  daysInMonthBs,
  diffDaysBs,
  formatBs,
  parseBs,
  toDevanagariDigits,
  weekdayOf,
} from "@mero-pasal/shared/dates";
import { MAX_BACKDATE_DAYS } from "@mero-pasal/shared/domain";
import { Sheet } from "@mero-pasal/ui/components/sheet";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/features/session/locale";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/**
 * F-05 date sheet (ui-ux §5.4): आज / हिजो / अस्ति, or अरू मिति for a BS month grid. At most 90 days
 * back, never in the future. `null` means "today" (decided at save time, in NPT).
 */
export function DateSheet({
  open,
  today,
  value,
  onPick,
  onClose,
}: {
  open: boolean;
  today: string;
  value: string | null;
  onPick: (dateBs: string | null) => void;
  onClose: () => void;
}) {
  const { locale, t } = useLocale();
  const [showGrid, setShowGrid] = useState(false);
  const selected = value ?? today;
  const [month, setMonth] = useState(() => parseBs(selected));
  useEffect(() => {
    if (open) {
      setShowGrid(false);
      setMonth(parseBs(value ?? today));
    }
  }, [open, value, today]);

  const quick = [
    { label: t("date.today"), date: null, dateBs: today },
    { label: t("date.yesterday"), date: addDaysBs(today, -1), dateBs: addDaysBs(today, -1) },
    { label: t("date.dayBefore"), date: addDaysBs(today, -2), dateBs: addDaysBs(today, -2) },
  ];
  const allowed = (dateBs: string) => {
    const back = diffDaysBs(dateBs, today);
    return back >= 0 && back <= MAX_BACKDATE_DAYS;
  };
  const digits = (text: string) => (locale === "ne" ? toDevanagariDigits(text) : text);

  // Month grid
  const first = iso(month.year, month.month, 1);
  const days = daysInMonthBs(month.year, month.month);
  const lead = weekdayOf(first);
  const [, monthName = "", yearLabel = ""] = formatBs(first, locale, "long").split(" ");
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => addDaysBs(first, i))
    .sort((a, b) => weekdayOf(a) - weekdayOf(b))
    .map((d) => {
      const name = formatBs(d, locale, "weekdayDayMonth").split(",")[0] ?? "";
      return locale === "ne" ? name.replace(/बार$/, "") : name.slice(0, 3);
    });
  const firstAllowed = addDaysBs(today, -MAX_BACKDATE_DAYS);
  const canPrev = first > `${firstAllowed.slice(0, 8)}01`;
  const canNext = first < `${today.slice(0, 8)}01`;
  const shift = (delta: 1 | -1) =>
    setMonth((m) => {
      const index = m.year * 12 + (m.month - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1, day: 1 };
    });

  return (
    <Sheet open={open} onClose={onClose} title={t("date.label")}>
      {quick.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onPick(option.date)}
          aria-pressed={selected === option.dateBs}
          className="flex min-h-[60px] w-full items-center justify-between border-b border-rule px-1 text-left text-[19px] font-semibold"
        >
          {option.label}
          <small className="text-base font-medium text-ink-soft">
            {formatBs(option.dateBs, locale, "dayMonth")}
          </small>
        </button>
      ))}
      <button
        type="button"
        onClick={() => setShowGrid((g) => !g)}
        aria-expanded={showGrid}
        className="flex min-h-[60px] w-full items-center justify-between px-1 text-left text-[19px] font-semibold"
      >
        {t("date.pick")}
        <Icon
          name="chevron"
          className={`size-6 transition-transform ${showGrid ? "rotate-180" : ""}`}
        />
      </button>

      {showGrid ? (
        <div className="mt-1">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={t("date.prevMonth")}
              disabled={!canPrev}
              onClick={() => shift(-1)}
              className="grid size-12 place-items-center rounded-full disabled:opacity-30"
            >
              <Icon name="back" />
            </button>
            <b className="font-display text-xl">
              {monthName} {yearLabel}
            </b>
            <button
              type="button"
              aria-label={t("date.nextMonth")}
              disabled={!canNext}
              onClick={() => shift(1)}
              className="grid size-12 place-items-center rounded-full disabled:opacity-30"
            >
              <Icon name="back" className="size-6 rotate-180" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdayLabels.map((label) => (
              <span key={label} className="pb-1 text-[15px] font-semibold text-ink-soft">
                {label}
              </span>
            ))}
            {Array.from({ length: days }, (_, i) => {
              const dateBs = iso(month.year, month.month, i + 1);
              const isSelected = dateBs === selected;
              return (
                <button
                  key={dateBs}
                  type="button"
                  disabled={!allowed(dateBs)}
                  aria-pressed={isSelected}
                  // Day 1 starts under its weekday column; the rest flow after it.
                  style={i === 0 ? { gridColumnStart: lead + 1 } : undefined}
                  onClick={() => onPick(dateBs === today ? null : dateBs)}
                  className={`min-h-12 rounded-xl text-lg font-semibold tabular-nums disabled:opacity-25 ${
                    isSelected
                      ? "bg-ink text-white"
                      : dateBs === today
                        ? "border-2 border-ink"
                        : "bg-card"
                  }`}
                >
                  {digits(String(i + 1))}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
