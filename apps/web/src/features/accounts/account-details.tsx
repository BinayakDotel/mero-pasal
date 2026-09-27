"use client";

import { formatBs } from "@mero-pasal/shared/dates";
import type { ReactNode } from "react";
import { useLocale } from "@/features/session/locale";
import { KIND_LABEL, otherScript } from "./profile";

type Profile = {
  kind: "customer" | "supplier" | "both";
  displayName: string;
  nameLatin?: string;
  nameDevanagari?: string;
  phone?: string;
  tag?: string;
  firstBillDateBs?: string;
  lastBillDateBs?: string;
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-rule/70 py-1.5 last:border-b-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="min-w-0 text-right font-semibold break-words">{children}</dd>
    </div>
  );
}

/** F-07 profile details: the other script, phone, tag, kind, first and last bill. */
export function AccountDetails({ account }: { account: Profile }) {
  const { locale, t } = useLocale();
  const other = otherScript(account);
  const date = (bs: string) => formatBs(bs, locale, "long");
  return (
    <section aria-label={t("account.details")} className="mx-4 mt-3 rounded-card bg-card px-4 py-1">
      <dl>
        {other ? <Row label={t("account.otherScript")}>{other}</Row> : null}
        {account.phone ? (
          <Row label={t("account.phone")}>
            <a href={`tel:${account.phone}`} className="text-buy underline underline-offset-4">
              {account.phone}
            </a>
          </Row>
        ) : null}
        {account.tag ? <Row label={t("account.tag")}>{account.tag}</Row> : null}
        <Row label={t("account.kind")}>{t(KIND_LABEL[account.kind])}</Row>
        {account.firstBillDateBs ? (
          <Row label={t("account.firstBill")}>{date(account.firstBillDateBs)}</Row>
        ) : null}
        {account.lastBillDateBs ? (
          <Row label={t("account.lastBill")}>{date(account.lastBillDateBs)}</Row>
        ) : null}
      </dl>
    </section>
  );
}
