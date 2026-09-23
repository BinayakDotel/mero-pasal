"use client";

import { diffDaysBs, formatBs, todayBs } from "@mero-pasal/shared/dates";
import { formatNpr } from "@mero-pasal/shared/money";
import type { ReactNode } from "react";
import { useLocale } from "@/features/session/locale";
import type { PickerParty } from "./use-picker-parties";

/** First visible letter (a whole grapheme, so "कृ" stays together). */
function initial(name: string): string {
  const [first] = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name.trim());
  return first?.segment.toUpperCase() ?? "?";
}

/** "आज" / "हिजो" / "अस्ति" for the last three days, then "७ असोज". */
function useDayWord() {
  const { locale, t } = useLocale();
  return (dateBs: string) => {
    const days = diffDaysBs(dateBs, todayBs(Date.now()));
    if (days === 0) return t("date.today");
    if (days === 1) return t("date.yesterday");
    if (days === 2) return t("date.dayBefore");
    return formatBs(dateBs, locale, "dayMonth");
  };
}

export function Avatar({
  name,
  className = "bg-buy-tint text-buy",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-[46px] flex-none place-items-center rounded-full font-display text-[21px] font-bold ${className}`}
    >
      {initial(name)}
    </span>
  );
}

/** F-04 picker row: avatar, "name · tag", and the last bill ("हिजो · रु 2,340"). ≥ 64 px tall. */
export function PartyRow({
  party,
  onPick,
  right,
}: {
  party: PickerParty;
  onPick: () => void;
  right?: ReactNode;
}) {
  const { locale, t } = useLocale();
  const dayWord = useDayWord();
  const lastBill =
    party.lastBillDateBs === undefined
      ? null
      : `${dayWord(party.lastBillDateBs)} · ${
          party.lastBillPaisa === undefined
            ? t("bill.noAmount")
            : formatNpr(party.lastBillPaisa, { locale })
        }`;
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-h-[68px] w-full items-center gap-3.5 border-b border-rule px-4 py-2 text-left active:bg-sale-tint"
    >
      <Avatar name={party.displayName} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[19px] leading-tight font-semibold">
          {party.displayName}
          {party.tag ? <span className="font-medium text-ink-soft"> · {party.tag}</span> : null}
        </span>
        {lastBill ? <span className="block text-[15px] text-ink-soft">{lastBill}</span> : null}
      </span>
      {right}
    </button>
  );
}
