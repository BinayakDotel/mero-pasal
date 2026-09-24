"use client";

import { formatNpr } from "@mero-pasal/shared/money";
import { Sheet } from "@mero-pasal/ui/components/sheet";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/features/session/locale";
import { useMember } from "@/features/session/member-gate";
import { useSync } from "./sync-provider";
import { useConnection } from "./use-connection";
import { useOutboxRows } from "./use-outbox-rows";

/** The deployed build (Vercel exposes the commit to Next.js), for Binayak's diagnostics. */
const BUILD = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

const STORAGE_WARN_BYTES = 100 * 1024 * 1024;
const STORAGE_LOW_FREE = 50 * 1024 * 1024;

/**
 * F-09 sync pill (ui-ux §2.7: always in words): all saved / N waiting / no internet / couldn't
 * upload. Tapping it lists what's waiting, with "Try now".
 */
export function SyncPill() {
  const { locale, t } = useLocale();
  const { engine, owner } = useSync();
  // Admin only (Binayak): why an item is waiting, and which build this phone runs.
  const diagnostics = useMember().member.role === "admin";
  const connected = useConnection();
  const rows = useOutboxRows();
  const [open, setOpen] = useState(false);
  const [storageLow, setStorageLow] = useState(false);

  const mine = useMemo(
    () => rows.filter((r) => r.ownerClerkId === owner?.clerkId && r.status !== "done"),
    [rows, owner],
  );
  const failed = mine.filter((r) => r.status === "failed").length;
  const waiting = mine.length - failed;

  useEffect(() => {
    if (!open || !navigator.storage?.estimate) return;
    void navigator.storage.estimate().then(({ usage = 0, quota = Number.POSITIVE_INFINITY }) => {
      setStorageLow(usage > STORAGE_WARN_BYTES || quota - usage < STORAGE_LOW_FREE);
    });
  }, [open]);

  const state = failed > 0 ? "failed" : !connected ? "offline" : waiting > 0 ? "pending" : "ok";
  const label =
    state === "failed"
      ? t("sync.failed")
      : state === "offline"
        ? t("sync.offline")
        : state === "pending"
          ? t("sync.pending", { n: waiting })
          : t("sync.ok");
  const tone = state === "ok" ? "bg-sale-tint text-sale" : "bg-udharo-tint text-ink";
  const icon = state === "ok" ? "check" : state === "offline" ? "cloudOff" : "clock";

  const names = new Map(
    rows.flatMap((r) => (r.type === "party.create" ? [[r.clientId, r.payload.name] as const] : [])),
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mx-4 mt-1.5 inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-left text-[15px] font-semibold ${tone}`}
      >
        <Icon name={icon} className="size-[18px]" />
        {label}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("sync.sheetTitle")}>
        {mine.length === 0 ? (
          <p className="text-ink-soft">{t("sync.allSent")}</p>
        ) : (
          <ul className="mb-3">
            {mine.map((r) => {
              const blocked = r.status === "failed" && r.lastError?.startsWith("BLOCKED");
              const partyRef = r.type === "tx.create" ? r.payload.partyRef : undefined;
              const who =
                r.type === "party.create"
                  ? t("sync.newName", { name: r.payload.name })
                  : r.type !== "tx.create"
                    ? `${t(r.type === "tx.remove" ? "bill.removed" : "bill.corrected")}: ${
                        r.before.partyName ??
                        t(r.before.kind === "sale" ? "kind.sale" : "kind.purchase")
                      }`
                    : partyRef && "clientId" in partyRef
                      ? (names.get(partyRef.clientId) ?? "—")
                      : t(r.payload.kind === "sale" ? "kind.sale" : "kind.purchase");
              return (
                <li
                  key={r.clientId}
                  className="flex min-h-14 items-center justify-between gap-3 border-b border-rule py-1.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{who}</span>
                    <span
                      className={`block text-[15px] ${r.status === "failed" ? "font-semibold text-bahi" : "text-ink-soft"}`}
                    >
                      {blocked
                        ? t("sync.blocked")
                        : r.status === "failed"
                          ? t("sync.failed")
                          : t("sync.statusPending")}
                    </span>
                    {diagnostics && r.lastError ? (
                      <span lang="en" className="block text-[13px] break-all text-ink-soft">
                        {r.lastError} · {r.failures}× · {r.attempts} tries
                      </span>
                    ) : null}
                  </span>
                  {r.type === "tx.create" && r.payload.amountPaisa !== undefined ? (
                    <span className="font-display font-bold tabular-nums">
                      {formatNpr(r.payload.amountPaisa, { locale })}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {!connected && mine.length > 0 ? (
          <p className="mb-3 text-ink-soft">{t("sync.offlineHint")}</p>
        ) : null}
        {storageLow ? (
          <p
            role="alert"
            className="mb-3 rounded-xl bg-udharo-tint p-3 font-semibold text-udharo-ink"
          >
            {t("sync.storageLow")}
          </p>
        ) : null}
        {mine.length > 0 ? (
          <button
            type="button"
            onClick={() => void engine.retryNow()}
            className="min-h-14 w-full rounded-[14px] bg-ink text-lg font-bold text-white"
          >
            {t("sync.tryNow")}
          </button>
        ) : null}
        {diagnostics ? (
          <p lang="en" className="mt-3 text-center text-[13px] text-ink-soft">
            build {BUILD}
          </p>
        ) : null}
      </Sheet>
    </>
  );
}
