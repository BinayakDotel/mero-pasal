"use client";

import { toDevanagariDigits } from "@mero-pasal/shared/dates";
import { AmountText } from "@mero-pasal/ui/components/amount-text";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/features/session/locale";
import type { BillItem } from "./bill-item";

const nptTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kathmandu",
  hour: "2-digit",
  minute: "2-digit",
});

function useThumbUrl(thumb: BillItem["thumb"]): string | null {
  const [url, setUrl] = useState<string | null>(thumb && "url" in thumb ? thumb.url : null);
  useEffect(() => {
    if (!thumb) return setUrl(null);
    if ("url" in thumb) return setUrl(thumb.url);
    const objectUrl = URL.createObjectURL(thumb.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [thumb]);
  return url;
}

/**
 * F-02 / ui-ux §5.5 bill row: type edge, thumbnail, name with capture time, amount or the
 * "रकम छैन" tag, and a clock while the bill is still waiting on the phone (F-09). Tapping opens
 * the bill (F-08), by clientId so a bill still on the phone opens too.
 */
export function BillRow({ bill, highlight = false }: { bill: BillItem; highlight?: boolean }) {
  const { locale, t } = useLocale();
  const thumbUrl = useThumbUrl(bill.thumb);
  const name = bill.isWalkIn ? t("party.walkIn") : (bill.partyName ?? t("party.noName"));
  const time = nptTime.format(bill.capturedAt);
  return (
    <li className="border-b border-rule">
      <Link
        href={`/bills/${encodeURIComponent(bill.clientId)}`}
        className={`grid min-h-[70px] grid-cols-[6px_50px_1fr_auto] items-center gap-3 py-2 pr-4 transition-colors duration-700 active:bg-rule/40 ${highlight ? "bg-sale-tint" : ""}`}
      >
        <span
          className={`self-stretch rounded-r ${bill.kind === "sale" ? "bg-sale" : "bg-buy"}`}
          aria-hidden="true"
        />
        {thumbUrl ? (
          // biome-ignore lint/performance/noImgElement: Convex storage URL or local blob; thumbnails only (F-06)
          <img
            src={thumbUrl}
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
          <span className="flex items-center gap-1.5 text-[15px] text-ink-soft">
            {bill.pending ? (
              <span className="inline-flex items-center" title={t("sync.statusPending")}>
                <Icon name="clock" className="size-4" />
                <span className="sr-only">{t("sync.statusPending")}</span>
              </span>
            ) : null}
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
      </Link>
    </li>
  );
}
