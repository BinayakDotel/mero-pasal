"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import { daysInMonthBs, monthOf } from "@mero-pasal/shared/dates";
import { formatNpr } from "@mero-pasal/shared/money";
import { useQuery } from "convex/react";
import { useState } from "react";
import { monthLabel, recentMonths } from "@/features/accounts/months";
import { PageHead } from "@/features/admin/admin-shell";
import { Duplicates, NeedsAttention } from "@/features/admin/attention";
import {
  cellClass,
  EmptyRow,
  inputClass,
  Panel,
  rowClass,
  SkeletonRows,
  Table,
} from "@/features/admin/ui";
import { useTodayBs } from "@/features/today/use-today-bs";

const when = (ms: number | undefined) =>
  ms === undefined
    ? "—"
    : new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kathmandu",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(ms);

/** F-11 overview: this month's numbers, what needs fixing, and whether every phone is syncing. */
export default function AdminOverviewPage() {
  const thisMonth = monthOf(useTodayBs());
  const [month, setMonth] = useState(thisMonth);
  const [year, mm] = month.split("-").map(Number) as [number, number];
  const totals = useQuery(api.summaries.forRange, {
    fromBs: `${month}-01`,
    toBs: `${month}-${String(daysInMonthBs(year, mm)).padStart(2, "0")}`,
  });
  const members = useQuery(api.memberAdmin.list, {});
  const rs = (paisa: number) => formatNpr(paisa, { locale: "en" });
  return (
    <>
      <PageHead title="Overview">
        <select
          aria-label="Month"
          className={inputClass}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        >
          {recentMonths(thisMonth, 12).map((m) => (
            <option key={m} value={m}>
              {monthLabel(m, "en")}
            </option>
          ))}
        </select>
      </PageHead>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-5.5">
        <div className="grid gap-5.5">
          <NeedsAttention />
          <Duplicates />
        </div>
        <div className="grid gap-5.5">
          <Panel title={monthLabel(month, "en")}>
            <Table head={["", "Bills", "Amount"]}>
              {totals === undefined ? (
                <SkeletonRows columns={3} rows={3} />
              ) : (
                <>
                  <tr className={rowClass}>
                    <td className={cellClass}>Sold</td>
                    <td className={cellClass}>{totals.saleCount}</td>
                    <td className={cellClass}>{rs(totals.salePaisa)}</td>
                  </tr>
                  <tr className={rowClass}>
                    <td className={cellClass}>Bought</td>
                    <td className={cellClass}>{totals.purchaseCount}</td>
                    <td className={cellClass}>{rs(totals.purchasePaisa)}</td>
                  </tr>
                  <tr className={rowClass}>
                    <td className={cellClass}>Without amount</td>
                    <td className={cellClass}>{totals.missingAmountCount}</td>
                    <td className={cellClass} />
                  </tr>
                </>
              )}
            </Table>
          </Panel>
          <Panel title="Members" aside="sync health">
            <Table head={["Member", "Last seen", "Last sync", "Waiting"]}>
              {members === undefined ? (
                <SkeletonRows columns={4} rows={2} />
              ) : members.length === 0 ? (
                <EmptyRow columns={4}>No members.</EmptyRow>
              ) : (
                members
                  .filter((m) => m.active)
                  .map((m) => (
                    <tr key={m._id} className={rowClass}>
                      <td className={cellClass}>{m.displayName}</td>
                      <td className={cellClass}>{m.invited ? "invited" : when(m.lastSeenAt)}</td>
                      <td className={cellClass}>{when(m.lastSyncAt)}</td>
                      <td className={`${cellClass} ${m.failed ? "font-bold text-bahi" : ""}`}>
                        {m.pending}
                        {m.failed ? ` · ${m.failed} failed` : ""}
                      </td>
                    </tr>
                  ))
              )}
            </Table>
          </Panel>
        </div>
      </div>
    </>
  );
}
