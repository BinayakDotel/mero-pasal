"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import { addDaysBs, monthOf } from "@mero-pasal/shared/dates";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { monthLabel, recentMonths } from "@/features/accounts/months";
import { PageHead } from "@/features/admin/admin-shell";
import { billsCsv, csvFileName, type ExportBill } from "@/features/admin/csv";
import { monthRange, rangeArgs } from "@/features/admin/range";
import { Button, inputClass, Panel, useShowError } from "@/features/admin/ui";
import { useConnection } from "@/features/sync/use-connection";
import { useTodayBs } from "@/features/today/use-today-bs";

const PAGE = 200;
type AdminPage = FunctionReturnType<typeof api.billQueries.listForAdmin>;

/** F-14 / UC-10: every bill of a BS range (removed ones too) as a CSV Excel opens. */
export default function AdminExportPage() {
  const convex = useConvex();
  const today = useTodayBs();
  const thisMonth = monthOf(today);
  const lastMonth = monthOf(addDaysBs(monthRange(thisMonth).fromBs, -1));
  const [from, setFrom] = useState(monthRange(lastMonth).fromBs);
  const [to, setTo] = useState(monthRange(lastMonth).toBs);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const showError = useShowError();
  const online = useConnection();
  const range = rangeArgs(from, to);
  const ready = Boolean(range?.fromBs && range.toBs);

  const download = async () => {
    if (!range?.fromBs || !range.toBs) return;
    const { fromBs, toBs } = range;
    setBusy(true);
    setCount(0);
    try {
      const bills: ExportBill[] = [];
      for (const filter of ["all", "removed"] as const) {
        let cursor: string | null = null;
        for (;;) {
          const page: AdminPage = await convex.query(api.billQueries.listForAdmin, {
            filter,
            fromBs,
            toBs,
            paginationOpts: { numItems: PAGE, cursor },
          });
          bills.push(...page.page);
          setCount(bills.length);
          if (page.isDone) break;
          cursor = page.continueCursor;
        }
      }
      const url = URL.createObjectURL(
        new Blob([billsCsv(bills)], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = csvFileName(fromBs, toBs);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      showError(e);
      setCount(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Export" />
      <div className="grid max-w-[640px] gap-5.5">
        <Panel title="Export bills (CSV)" aside="F-14">
          <div className="grid gap-3 p-4">
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Month"
                className={inputClass}
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  const m = monthRange(e.target.value);
                  setFrom(m.fromBs);
                  setTo(m.toBs);
                }}
              >
                <option value="">Month…</option>
                {recentMonths(thisMonth, 12).map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m, "en")}
                  </option>
                ))}
              </select>
              <input
                aria-label="From (BS)"
                className={`${inputClass} w-36 ${ready ? "" : "border-bahi"}`}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <input
                aria-label="To (BS)"
                className={`${inputClass} w-36 ${ready ? "" : "border-bahi"}`}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
              <Button
                tone="primary"
                disabled={!ready || busy || !online}
                onClick={() => void download()}
              >
                {busy ? "Preparing…" : "Download CSV"}
              </Button>
            </div>
            <p className="text-[13px] text-ink-soft">
              Columns: date BS, date AD, type, account, amount (Rs), bill number, photos, captured
              by, status. Removed bills are included as "removed". Opens in Excel with Devanagari
              intact.
            </p>
            {count !== null ? (
              <p role="status" className="font-semibold">
                {busy ? `Reading bills… ${count}` : `Exported ${count} bills.`}
              </p>
            ) : null}
          </div>
        </Panel>
        <Panel title="Monthly backup">
          <ol className="grid list-decimal gap-1.5 py-4 pr-4 pl-9">
            <li>Early each month, download last month's CSV here.</li>
            <li>
              Take a Convex snapshot export (dashboard → Settings → Snapshot export) and keep both
              off the platform.
            </li>
            <li>Tick it off in the progress tracker.</li>
          </ol>
        </Panel>
      </div>
    </>
  );
}
