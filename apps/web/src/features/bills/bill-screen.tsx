"use client";

import { formatBs, toDevanagariDigits } from "@mero-pasal/shared/dates";
import { AmountText } from "@mero-pasal/ui/components/amount-text";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { NotFoundScreen } from "@/features/nav/not-found-screen";
import { useLocale } from "@/features/session/locale";
import { PhotoViewer } from "./photo-viewer";
import { useBillDetail } from "./use-bill-detail";

const nptTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kathmandu",
  hour: "2-digit",
  minute: "2-digit",
});

/** F-08 / ui-ux §5.7: the photo, then the bill's fields as ruled ledger lines. */
export function BillScreen({ clientId }: { clientId: string }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const bill = useBillDetail(clientId);
  const digits = (text: string) => (locale === "ne" ? toDevanagariDigits(text) : text);

  if (bill === null) return <NotFoundScreen backHref="/bills" />;
  const name = bill?.isWalkIn ? t("party.walkIn") : (bill?.partyName ?? t("party.noName"));

  return (
    <main className="flex-1 pb-6">
      <header className="flex items-center gap-2 px-2 pt-2 pb-1">
        <button
          type="button"
          aria-label={t("common.back")}
          onClick={() => router.back()}
          className="grid size-12 flex-none place-items-center rounded-full active:bg-rule/40"
        >
          <Icon name="back" />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-[25px] leading-tight font-bold">
          {bill ? name : ""}
        </h1>
      </header>
      {bill === undefined ? (
        <div aria-busy="true" className="aspect-[3/4] w-full animate-pulse bg-ink/80" />
      ) : (
        <>
          {bill.status === "deleted" ? (
            <p role="status" className="bg-bahi px-4 py-2 font-bold text-white">
              {t("bill.removed")}
            </p>
          ) : null}
          <PhotoViewer urls={bill.photos} />
          <dl className="ledger mx-4 mt-3 pr-3.5">
            <Field label={t("field.type")}>
              <span className={bill.kind === "sale" ? "text-sale" : "text-buy"}>
                {t(bill.kind === "sale" ? "kind.sale" : "kind.purchase")}
              </span>
            </Field>
            <Field label={t("field.name")}>
              {bill.partyId && !bill.pending ? (
                <Link href={`/accounts/${bill.partyId}`} className="underline">
                  {name}
                </Link>
              ) : (
                name
              )}
            </Field>
            <Field label={t("field.amount")}>
              {bill.amountPaisa === undefined ? (
                <span className="rounded-full bg-udharo-tint px-2.5 py-0.5 font-bold text-udharo-ink">
                  {t("bill.noAmount")}
                </span>
              ) : (
                <AmountText paisa={bill.amountPaisa} locale={locale} className="text-[21px]" />
              )}
            </Field>
            <Field label={t("date.label")}>{formatBs(bill.dateBs, locale, "long")}</Field>
            {bill.billNumber ? (
              <Field label={t("field.billNumber")}>{bill.billNumber}</Field>
            ) : null}
            <Field label={t("field.pages")}>{digits(String(bill.photos.length))}</Field>
            <Field label={t("field.capturedBy")}>{bill.capturedByName}</Field>
            <Field label={t("field.time")}>
              <span className="inline-flex items-center gap-1.5">
                {bill.pending ? (
                  <>
                    <Icon name="clock" className="size-4" />
                    <span className="sr-only">{t("sync.statusPending")}</span>
                  </>
                ) : null}
                {digits(nptTime.format(bill.capturedAt))}
              </span>
            </Field>
          </dl>
        </>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-12 items-center justify-between gap-2.5">
      <dt className="font-semibold text-ink-soft">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[19px] font-semibold">{children}</dd>
    </div>
  );
}
