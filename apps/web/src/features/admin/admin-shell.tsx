"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMember } from "@/features/session/member-gate";
import { useConnection } from "@/features/sync/use-connection";
import { ToastProvider, useSearchShortcut } from "./ui";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/bills", label: "Bills" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/export", label: "Export" },
] as const;

/**
 * F-11 / ui-ux §6: Binayak's console. Desktop-first (≥ 1024 px), English (ADR-034). Only
 * admins get in; Convex checks every call anyway (architecture §10).
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { member, shop } = useMember();
  const connected = useConnection();
  const path = usePathname();
  useSearchShortcut();
  if (member.role !== "admin") {
    return (
      <main className="grid min-h-dvh place-content-center gap-3 p-6 text-center">
        <p className="text-lg">The admin console is for admins only.</p>
        <Link href="/" className="font-semibold underline">
          Back to the app
        </Link>
      </main>
    );
  }
  return (
    <ToastProvider>
      <div className="grid min-h-dvh grid-cols-[232px_1fr] text-[15px] leading-[1.45]">
        <aside className="sticky top-0 flex h-dvh flex-col gap-1 border-r border-rule bg-card px-3.5 py-4.5">
          <div className="mb-3 px-2">
            <b className="block font-display text-2xl leading-none">Mero Pasal</b>
            <small className="text-[13px] text-ink-soft">{shop.name} · admin</small>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const on = item.href === "/admin" ? path === "/admin" : path.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 font-semibold ${on ? "bg-ink text-white" : "hover:bg-paper"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto px-2 text-[13px] text-ink-soft">
            Signed in as {member.displayName}
            <br />
            <Link href="/" className="underline">
              Open Buwa's app
            </Link>
          </div>
        </aside>
        <div className="min-w-0">
          {!connected ? (
            <p role="status" className="bg-udharo-tint px-7 py-2 font-semibold text-udharo-ink">
              Offline — changes can't be saved now.
            </p>
          ) : null}
          <p className="bg-buy-tint px-7 py-2 text-[13px] text-buy lg:hidden">
            The admin console is made for a computer screen (1024 px or wider).
          </p>
          <main className="px-7 pt-5.5 pb-16">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}

/** The page title row (ui-ux §6). */
export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4.5 flex flex-wrap items-center gap-3">
      <h1 className="flex-1 font-display text-[28px] leading-tight font-bold">{title}</h1>
      {children}
    </div>
  );
}
