"use client";

import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { monthOf } from "@mero-pasal/shared/dates";
import { AmountText } from "@mero-pasal/ui/components/amount-text";
import { Chip } from "@mero-pasal/ui/components/chip";
import { LedgerStrip } from "@mero-pasal/ui/components/ledger-strip";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { BillGroups } from "@/features/bills/bill-groups";
import { useLocale } from "@/features/session/locale";
import { useTodayBs } from "@/features/today/use-today-bs";
import { monthLabel, recentMonths } from "./months";
import { useAccount } from "./use-account";

const MONTH_CHIPS = 6;

/** F-07 / ui-ux §5.6 account page: header with call, यो महिना / जम्मा, then its bills. */
export function AccountScreen({ partyId }: { partyId: Id<"parties"> }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const thisMonth = monthOf(useTodayBs());
  const [month, setMonth] = useState<string | null>(null); // null = all months
  const { account, live, bills, canLoadMore, loadMore } = useAccount(partyId, thisMonth, month);

  // A merged account lives on under the account it was merged into.
  useEffect(() => {
    if (account?.mergedIntoId) router.replace(`/accounts/${account.mergedIntoId}`);
  }, [account?.mergedIntoId, router]);

  const isSupplier = account?.kind === "supplier";
  const paisa = (totals: { salePaisa: number; purchasePaisa: number }) =>
    isSupplier ? totals.purchasePaisa : totals.salePaisa;
  const name = account?.isWalkIn ? t("party.walkIn") : account?.displayName;

  return (
    <main className="flex-1 pb-4">
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
          {name ?? ""}
          {account?.tag ? (
            <span className="font-medium text-ink-soft"> · {account.tag}</span>
          ) : null}
        </h1>
        {account?.phone ? (
          <a
            href={`tel:${account.phone}`}
            aria-label={t("account.call")}
            className="grid size-12 flex-none place-items-center rounded-full border-2 border-rule bg-card"
          >
            <Icon name="phone" />
          </a>
        ) : null}
      </header>

      {account ? (
        <div className="mx-4 mt-2">
          <LedgerStrip
            heading={`${t(isSupplier ? "kind.purchase" : "kind.sale")}${live ? "" : ` ${t("sync.stale")}`}`}
            rows={[
              {
                label: t("account.thisMonth"),
                tone: isSupplier ? "purchase" : "sale",
                value: <AmountText paisa={paisa(account.month)} locale={locale} />,
                count: t("today.billCount", { n: account.month.billCount }),
              },
              {
                label: t("account.allTime"),
                tone: isSupplier ? "purchase" : "sale",
                value: <AmountText paisa={paisa(account.allTime)} locale={locale} />,
                count: t("today.billCount", { n: account.allTime.billCount }),
              },
            ]}
          />
        </div>
      ) : (
        <div aria-busy="true" className="mx-4 mt-2 h-[146px] animate-pulse bg-card" />
      )}

      <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-3">
        <Chip selected={month === null} onClick={() => setMonth(null)}>
          {t("account.allMonths")}
        </Chip>
        {recentMonths(thisMonth, MONTH_CHIPS).map((m) => (
          <Chip key={m} selected={month === m} onClick={() => setMonth(m)}>
            {monthLabel(m, locale)}
          </Chip>
        ))}
      </div>
      <BillGroups
        bills={bills}
        empty={t("bills.empty")}
        canLoadMore={canLoadMore}
        loadMore={loadMore}
      />
    </main>
  );
}
