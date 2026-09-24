"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import { monthOf } from "@mero-pasal/shared/dates";
import { AmountText } from "@mero-pasal/ui/components/amount-text";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Avatar } from "@/features/capture/party-row";
import { usePickerParties } from "@/features/capture/use-picker-parties";
import { useLocale } from "@/features/session/locale";
import { useCachedQuery } from "@/features/sync/use-cached-query";
import { useTodayBs } from "@/features/today/use-today-bs";
import { type AccountRow, type AccountTab, accountRows } from "./account-rows";

/** F-07 / ui-ux §5.6: ग्राहक / सप्लायर tabs, name search, this month's total per account. */
export function AccountsScreen() {
  const { t } = useLocale();
  const monthBs = monthOf(useTodayBs());
  const [tab, setTab] = useState<AccountTab>("customers");
  const [query, setQuery] = useState("");
  const picker = usePickerParties(tab === "customers" ? "sale" : "purchase");
  const month = useCachedQuery(
    api.parties.monthTotals,
    { monthBs },
    `parties.monthTotals:${monthBs}`,
  );

  const rows = useMemo(() => {
    if (picker.loading) return undefined;
    const all = picker.walkIn ? [picker.walkIn, ...picker.parties] : picker.parties;
    const totals = new Map((month.data ?? []).map((m) => [m.partyId as string, m]));
    return accountRows(all, totals, tab, query);
  }, [picker, month.data, tab, query]);

  return (
    <main className="flex-1 pb-4">
      <header className="px-4 pt-3 pb-2">
        <h1 className="font-display text-[30px] leading-tight font-extrabold">
          {t("nav.accounts")}
          {month.live ? "" : ` ${t("sync.stale")}`}
        </h1>
      </header>
      <div role="tablist" className="mx-4 mb-3 grid grid-cols-2 rounded-full border-2 border-rule">
        {(["customers", "suppliers"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-12 rounded-full text-[17px] font-bold ${tab === value ? "bg-ink text-white" : ""}`}
          >
            {t(value === "customers" ? "accounts.customers" : "accounts.suppliers")}
          </button>
        ))}
      </div>
      <div className="relative mx-4 mb-2">
        <Icon
          name="search"
          className="pointer-events-none absolute top-4 left-3.5 size-6 text-ink-soft"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("party.search")}
          aria-label={t("party.search")}
          autoComplete="off"
          className="h-14 w-full rounded-[14px] border-2 border-rule bg-card pr-3.5 pl-12 text-[19px]"
        />
      </div>
      {rows === undefined ? (
        <div aria-busy="true" className="animate-pulse motion-reduce:animate-none">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-[68px] border-b border-rule" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-7 text-center text-ink-soft">{t("accounts.empty")}</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <AccountItem key={row.party._id} row={row} />
          ))}
        </ul>
      )}
    </main>
  );
}

function AccountItem({ row }: { row: AccountRow }) {
  const { locale, t } = useLocale();
  const name = row.party.isWalkIn ? t("party.walkIn") : row.party.displayName;
  const body = (
    <>
      <Avatar name={name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[19px] leading-tight font-semibold">
          {name}
          {row.party.tag ? (
            <span className="font-medium text-ink-soft"> · {row.party.tag}</span>
          ) : null}
        </span>
        <span className="flex items-center gap-1.5 text-[15px] text-ink-soft">
          {row.local ? <Icon name="clock" className="size-4" /> : null}
          {row.local
            ? t("sync.statusPending")
            : `${t("account.thisMonth")} · ${t("today.billCount", { n: row.monthCount })}`}
        </span>
      </span>
      {row.monthPaisa > 0 ? (
        <AmountText paisa={row.monthPaisa} locale={locale} className="text-[21px]" />
      ) : null}
    </>
  );
  const cls = "flex min-h-[68px] items-center gap-3.5 px-4 py-2";
  return (
    <li className="border-b border-rule">
      {row.local ? (
        <div className={cls}>{body}</div>
      ) : (
        <Link href={`/accounts/${row.party._id}`} className={`${cls} active:bg-sale-tint`}>
          {body}
        </Link>
      )}
    </li>
  );
}
