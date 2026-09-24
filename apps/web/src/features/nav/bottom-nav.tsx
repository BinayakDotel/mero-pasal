"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { useLocale } from "@/features/session/locale";

const ITEMS = [
  { key: "nav.today", icon: "sun", href: "/" },
  { key: "nav.bills", icon: "receipt", href: "/bills" }, // F-06
  { key: "nav.accounts", icon: "book", href: "/accounts" }, // F-07
] as const satisfies readonly { key: string; icon: IconName; href: string }[];

/** ui-ux §4: three items, icon + label. */
export function BottomNav({ active }: { active: "nav.today" | "nav.bills" | "nav.accounts" }) {
  const { t } = useLocale();
  return (
    <nav className="sticky bottom-0 grid h-[74px] flex-none grid-cols-3 border-t border-rule bg-card shadow-sheet">
      {ITEMS.map((item) => {
        const on = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`relative flex flex-col items-center justify-center gap-0.5 text-[15px] font-semibold ${
              on
                ? "text-ink before:absolute before:inset-x-[30%] before:top-0 before:h-[3px] before:rounded-b before:bg-ink"
                : "text-ink-soft"
            }`}
          >
            <Icon name={item.icon} />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
