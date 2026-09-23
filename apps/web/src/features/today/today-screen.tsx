"use client";

import type { BillKind } from "@mero-pasal/shared/domain";
import { BigButton } from "@mero-pasal/ui/components/big-button";
import { BsDateText } from "@mero-pasal/ui/components/bs-date-text";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Icon } from "@/components/icons";
import { useCapture } from "@/features/capture/capture-provider";
import { useCamera } from "@/features/capture/use-camera";
import { useLocale } from "@/features/session/locale";
import { useMember } from "@/features/session/member-gate";
import { useTodayBs } from "./use-today-bs";

/**
 * F-02 Today, M0 version (ui-ux §5.1): header, sync pill, the two big buttons and the empty
 * state. The buttons open the phone camera in one tap (F-03); the ledger strip and recent bills
 * arrive with saving (M1 PR 12).
 */
export function TodayScreen() {
  const { locale, setLocale, t } = useLocale();
  const { shop } = useMember();
  const today = useTodayBs();
  const shopName = locale === "ne" ? (shop.nameNe ?? shop.name) : shop.name;
  const router = useRouter();
  const { start } = useCapture();
  const kind = useRef<BillKind>("sale");
  const camera = useCamera((file) => {
    start(kind.current, file);
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

      {/* F-09: always in words. Nothing can be pending until capture exists (M1/M2). */}
      <p
        role="status"
        className="mx-4 mt-1.5 inline-flex min-h-10 items-center gap-2 rounded-full bg-sale-tint px-3.5 text-[15px] font-semibold text-sale"
      >
        <Icon name="check" className="size-[18px]" />
        {t("sync.ok")}
      </p>

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

      <p className="px-5 py-7 text-center text-ink-soft">{t("today.empty")}</p>
      {camera.input}
    </main>
  );
}
