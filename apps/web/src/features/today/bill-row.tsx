"use client";

import type { api } from "@mero-pasal/backend/convex/_generated/api";
import { toDevanagariDigits } from "@mero-pasal/shared/dates";
import { AmountText } from "@mero-pasal/ui/components/amount-text";
import type { FunctionReturnType } from "convex/server";
import { useLocale } from "@/features/session/locale";

export type RecentBill = FunctionReturnType<typeof api.transactions.listRecentForDate>[number];

const nptTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kathmandu",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * F-02 / ui-ux §5.5 bill row: type edge (colour), thumbnail, name with capture time, amount or
 * the "रकम छैन" tag. Rows open the bill in M3, so for now they're not buttons.
 */
export function BillRow({ bill, highlight }: { bill: RecentBill; highlight: boolean }) {
  const { locale, t } = useLocale();
  const name = bill.isWalkIn ? t("party.walkIn") : (bill.partyName ?? t("party.noName"));
  const time = nptTime.format(bill.capturedAt);
  return (
    <li
      className={`grid min-h-[70px] grid-cols-[6px_50px_1fr_auto] items-center gap-3 border-b border-rule py-2 pr-4 transition-colors duration-700 ${highlight ? "bg-sale-tint" : ""}`}
    >
      <span
        className={`self-stretch rounded-r ${bill.kind === "sale" ? "bg-sale" : "bg-buy"}`}
        aria-hidden="true"
      />
      {bill.thumbUrl ? (
        // biome-ignore lint/performance/noImgElement: Convex storage URL; list shows thumbnails only (F-06)
        <img
          src={bill.thumbUrl}
          alt=""
          width={50}
          height={56}
          loading="lazy"
          className="h-14 w-[50px] rounded-md border border-rule bg-white object-cover"
        />
      ) : (
        <span className="h-14 w-[50px] rounded-md border border-rule bg-card" />
      )}
      <span className="min-w-0">
        <span className="block truncate text-[19px] leading-tight font-semibold">{name}</span>
        <span className="block text-[15px] text-ink-soft">
          {t(bill.kind === "sale" ? "kind.sale" : "kind.purchase")} ·{" "}
          {locale === "ne" ? toDevanagariDigits(time) : time}
        </span>
      </span>
      <span className="text-right">
        {bill.amountPaisa === undefined ? (
          <span className="inline-block rounded-full bg-udharo-tint px-2.5 py-0.5 text-[15px] font-bold text-udharo-ink">
            {t("bill.noAmount")}
          </span>
        ) : (
          <AmountText paisa={bill.amountPaisa} locale={locale} className="text-[23px]" />
        )}
      </span>
    </li>
  );
}
