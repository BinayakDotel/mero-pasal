"use client";

import type { BillKind } from "@mero-pasal/shared/domain";
import { AmountText } from "@mero-pasal/ui/components/amount-text";
import { BigButton } from "@mero-pasal/ui/components/big-button";
import { BsDateText } from "@mero-pasal/ui/components/bs-date-text";
import { type LedgerRow, LedgerStrip } from "@mero-pasal/ui/components/ledger-strip";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { BillRow } from "@/features/bills/bill-row";
import { useCapture } from "@/features/capture/capture-provider";
import { useCamera } from "@/features/capture/use-camera";
import { useLocale } from "@/features/session/locale";
import { useMember } from "@/features/session/member-gate";
import { SyncPill } from "@/features/sync/sync-pill";
import { DraftCard } from "./draft-card";
import { useTodayBills } from "./use-today-bills";
import { useTodayBs } from "./use-today-bs";

/**
 * F-02 Today (ui-ux §5.1): header, sync pill, the two big buttons (one tap to the camera, F-03),
 * the "आजका बिल" ledger strip, and the 5 newest bills with the one just saved highlighted.
 */
export function TodayScreen() {
  const { locale, setLocale, t } = useLocale();
  const { shop } = useMember();
  const today = useTodayBs();
  const shopName = locale === "ne" ? (shop.nameNe ?? shop.name) : shop.name;
  const router = useRouter();
  const { start, lastSaved } = useCapture();
  const { totals, recent, live } = useTodayBills(today);
  const stale = live ? "" : ` ${t("sync.stale")}`; // ui-ux §7: saved copy while offline
  // F-02: the bill just saved glows briefly, then settles.
  const [glow, setGlow] = useState<string | null>(lastSaved);
  useEffect(() => {
    setGlow(lastSaved);
    const timer = setTimeout(() => setGlow(null), 3000);
    return () => clearTimeout(timer);
  }, [lastSaved]);
  const kind = useRef<BillKind>("sale");
  const camera = useCamera(async (file) => {
    await start(kind.current, file);
    router.push("/capture");
  });
  const capture = (billKind: BillKind) => {
    kind.current = billKind;
    camera.open();
  };

  return (
    <main className="flex-1 pb-4">
      <header className="flex items-start gap-2.5 px-4 pt-2.5 pb-1">
        <div className="flex-1">
          <h1 className="font-display text-[30px] leading-[1.05] font-extrabold">
            <BsDateText dateBs={today} locale={locale} style="weekdayDayMonth" />
          </h1>
          <p className="font-medium text-base text-ink-soft">{shopName}</p>
        </div>
        <button
          type="button"
          aria-label={t("lang.switch")}
          onClick={() => setLocale(locale === "ne" ? "en" : "ne")}
          className="size-12 flex-none rounded-full border-2 border-rule bg-card font-display text-[17px] font-bold"
        >
          {locale === "ne" ? "EN" : "ने"}
        </button>
      </header>

      <SyncPill />

      <div className="grid gap-3 px-4 pt-3.5 pb-1">
        <BigButton
          kind="sale"
          label={t("action.sale")}
          sub={t("action.sale.sub")}
          icon={<Icon name="bagOut" className="size-[34px]" />}
          onClick={() => capture("sale")}
        />
        <BigButton
          kind="purchase"
          label={t("action.purchase")}
          sub={t("action.purchase.sub")}
          icon={<Icon name="boxIn" className="size-[34px]" />}
          onClick={() => capture("purchase")}
        />
      </div>

      <DraftCard />

      {totals ? (
        <div className="mx-4 mt-3.5">
          <LedgerStrip
            heading={`${t("today.billed")}${stale}`}
            rows={[
              {
                label: t("kind.sale"),
                tone: "sale",
                value: <AmountText paisa={totals.salePaisa} locale={locale} />,
                count: t("today.billCount", { n: totals.saleCount }),
              } satisfies LedgerRow,
              {
                label: t("kind.purchase"),
                tone: "purchase",
                value: <AmountText paisa={totals.purchasePaisa} locale={locale} />,
                count: t("today.billCount", { n: totals.purchaseCount }),
              },
              ...(totals.missingAmountCount > 0
                ? [
                    {
                      label: t("today.noAmount"),
                      tone: "udharo" as const,
                      value: null,
                      count: t("today.billCount", { n: totals.missingAmountCount }),
                      warn: true,
                    },
                  ]
                : []),
            ]}
          />
        </div>
      ) : (
        <div
          aria-busy="true"
          className="mx-4 mt-3.5 h-[146px] animate-pulse bg-card motion-reduce:animate-none"
        />
      )}

      {recent === undefined ? null : recent.length === 0 ? (
        <p className="px-5 py-7 text-center text-ink-soft">{t("today.empty")}</p>
      ) : (
        <section className="mt-4.5">
          <h2 className="mx-4 mb-1 text-base font-bold text-ink-soft">
            {t("today.recent")}
            {stale}
          </h2>
          <ul>
            {recent.map((bill) => (
              <BillRow key={bill.key} bill={bill} highlight={bill.clientId === glow} />
            ))}
          </ul>
        </section>
      )}
      {camera.input}
    </main>
  );
}
