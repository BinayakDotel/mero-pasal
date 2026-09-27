"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import { monthLabel, recentMonths } from "@/features/accounts/months";
import { rs, timeNpt } from "./format";
import { monthRange, rangeArgs } from "./range";
import {
  Button,
  cellClass,
  EmptyRow,
  inputClass,
  isTyping,
  Panel,
  rowClass,
  SkeletonRows,
  Table,
} from "./ui";

export type AdminBill = FunctionReturnType<typeof api.billQueries.listForAdmin>["page"][number];
export type Filter = "all" | "sale" | "purchase" | "attention" | "removed";

const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["sale", "Sold"],
  ["purchase", "Bought"],
  ["attention", "Needs attention"],
  ["removed", "Removed"],
];
const PAGE = 50;
const COLUMNS = 8;

/**
 * F-11 bills table: every bill (removed ones too), filtered by type or flag, a BS date range
 * and an account; newest first, 50 at a time. A row (or j/k + Enter) opens the bill.
 */
export function BillsTable({
  thisMonth,
  onOpen,
  fixedPartyId,
  initialFilter = "all",
}: {
  thisMonth: string;
  onOpen: (bill: AdminBill) => void;
  /** One account's bills only (its profile page): the account filter is hidden. */
  fixedPartyId?: string;
  /** e.g. "removed" for a deleted account, whose bills were all removed with it. */
  initialFilter?: Filter;
}) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [chosenPartyId, setPartyId] = useState("");
  const partyId = fixedPartyId ?? chosenPartyId;
  const [range, setRange] = useState<{ fromBs?: string; toBs?: string }>({});
  const typed = rangeArgs(from, to);
  // Keep the last usable range while a date is half typed, so the table doesn't flicker.
  if (typed && (typed.fromBs !== range.fromBs || typed.toBs !== range.toBs)) setRange(typed);

  const accounts = useQuery(api.partyAdmin.list, {});
  const choosable = useMemo(
    () =>
      (accounts ?? [])
        .filter((p) => !p.mergedIntoId)
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [accounts],
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.billQueries.listForAdmin,
    { filter, ...range, ...(partyId ? { partyId: partyId as Id<"parties"> } : {}) },
    { initialNumItems: PAGE },
  );

  // New filters, new list: nothing is selected.
  const [selected, setSelected] = useState(-1);
  const query = `${filter}|${range.fromBs}|${range.toBs}|${partyId}`;
  const [shown, setShown] = useState(query);
  if (shown !== query) {
    setShown(query);
    setSelected(-1);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setSelected((i) => Math.max(0, Math.min(results.length - 1, i + (e.key === "j" ? 1 : -1))));
      } else if (e.key === "Enter" && results[selected]) {
        onOpen(results[selected]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [results, selected, onOpen]);

  return (
    <>
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <fieldset aria-label="Show" className="flex overflow-hidden rounded-lg border border-rule">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`h-[38px] px-3 font-semibold ${filter === value ? "bg-ink text-white" : "bg-card"}`}
            >
              {label}
            </button>
          ))}
        </fieldset>
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
          placeholder="From 2083-06-01"
          className={`${inputClass} w-40 ${typed ? "" : "border-bahi"}`}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          aria-label="To (BS)"
          placeholder="To 2083-06-30"
          className={`${inputClass} w-40 ${typed ? "" : "border-bahi"}`}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        {fixedPartyId ? null : (
          <select
            aria-label="Account"
            data-admin-search
            className={`${inputClass} max-w-64`}
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
          >
            <option value="">All accounts</option>
            {choosable.map((p) => (
              <option key={p._id} value={p._id}>
                {p.displayName}
                {p.tag ? ` · ${p.tag}` : ""}
                {p.archived ? " (archived)" : ""}
                {p.deletedAt === undefined ? "" : " (deleted)"}
              </option>
            ))}
          </select>
        )}
        {from || to || chosenPartyId ? (
          <Button
            tone="ghost"
            onClick={() => {
              setFrom("");
              setTo("");
              setPartyId("");
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <Panel
        title="Bills"
        aside={
          status === "LoadingFirstPage"
            ? ""
            : `${results.length}${status === "CanLoadMore" ? "+" : ""}`
        }
      >
        <Table head={["Date (BS)", "", "Type", "Account", "Amount", "Pages", "By", "Flags"]}>
          {status === "LoadingFirstPage" ? (
            <SkeletonRows columns={COLUMNS} rows={8} />
          ) : results.length === 0 ? (
            <EmptyRow columns={COLUMNS}>No bills match these filters.</EmptyRow>
          ) : (
            results.map((bill, i) => (
              <tr
                key={bill._id}
                aria-selected={i === selected}
                onClick={() => {
                  setSelected(i);
                  onOpen(bill);
                }}
                className={`${rowClass} cursor-pointer hover:bg-paper ${i === selected ? "bg-paper outline-2 -outline-offset-2 outline-ink" : ""} ${bill.status === "deleted" ? "text-ink-soft line-through" : ""}`}
              >
                <td className={`${cellClass} whitespace-nowrap`}>
                  {bill.dateBs}{" "}
                  <small className="text-ink-soft">· {timeNpt(bill.capturedAt)}</small>
                </td>
                <td className={cellClass}>
                  {bill.thumbUrl ? (
                    // biome-ignore lint/performance/noImgElement: Convex thumbnail URL
                    <img
                      src={bill.thumbUrl}
                      alt=""
                      className="h-9 w-7 rounded border border-rule object-cover"
                    />
                  ) : null}
                </td>
                <td className={cellClass}>{bill.kind === "sale" ? "Sold" : "Bought"}</td>
                <td className={cellClass}>{bill.partyName ?? "—"}</td>
                <td className={cellClass}>
                  {bill.amountPaisa === undefined ? "—" : rs(bill.amountPaisa)}
                </td>
                <td className={cellClass}>{bill.pages}</td>
                <td className={cellClass}>{bill.capturedByName}</td>
                <td className={`${cellClass} text-[13px] font-semibold no-underline`}>
                  {[
                    bill.status === "deleted" && "removed",
                    bill.noAmount && "no amount",
                    bill.noName && "no name",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </td>
              </tr>
            ))
          )}
        </Table>
        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <div className="p-3 text-center">
            <Button tone="ghost" disabled={status === "LoadingMore"} onClick={() => loadMore(PAGE)}>
              {status === "LoadingMore" ? "Loading…" : "Show more"}
            </Button>
          </div>
        ) : null}
      </Panel>
      <p className="mt-2.5 text-[13px] text-ink-soft">
        Click a row, or <kbd>j</kbd>/<kbd>k</kbd> and <kbd>Enter</kbd>, to open the bill. Removed
        bills stay here and can be restored.
      </p>
    </>
  );
}
