"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { formatNpr, rupeesToPaisa } from "@mero-pasal/shared/money";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { useConnection } from "@/features/sync/use-connection";
import {
  Button,
  cellClass,
  EmptyRow,
  inputClass,
  Panel,
  rowClass,
  SkeletonRows,
  Table,
  useShowError,
} from "./ui";

type Row = FunctionReturnType<typeof api.billQueries.listForAdmin>["page"][number];
type Account = FunctionReturnType<typeof api.partyAdmin.list>[number];

/** Accounts a bill of this type can go to (F-04: customers for sales, suppliers for purchases). */
export function accountsFor(kind: "sale" | "purchase", all: readonly Account[] | undefined) {
  return (all ?? []).filter(
    (p) =>
      !p.archived &&
      !p.mergedIntoId &&
      (p.kind === "both" || p.kind === (kind === "sale" ? "customer" : "supplier")),
  );
}

/** One needs-attention bill with its fix inline (UC-09): the amount read off the photo, or a name. */
function AttentionRow({ bill, accounts }: { bill: Row; accounts: readonly Account[] | undefined }) {
  const update = useMutation(api.billAdmin.update);
  const showError = useShowError();
  const online = useConnection();
  const [rupees, setRupees] = useState("");
  const [partyId, setPartyId] = useState("");
  const [saving, setSaving] = useState(false);
  const ready = (!bill.noAmount || /^\d+$/.test(rupees)) && (!bill.noName || partyId !== "");

  const save = async () => {
    setSaving(true);
    try {
      await update({
        clientId: bill.clientId,
        kind: bill.kind,
        dateBs: bill.dateBs,
        expectedUpdatedAt: bill.updatedAt,
        ...(bill.noName
          ? { partyId: partyId as Id<"parties"> }
          : bill.partyId
            ? { partyId: bill.partyId as Id<"parties"> }
            : {}),
        ...(bill.noAmount
          ? { amountPaisa: rupeesToPaisa(Number(rupees)) }
          : bill.amountPaisa === undefined
            ? {}
            : { amountPaisa: bill.amountPaisa }),
      });
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className={rowClass}>
      <td className={cellClass}>{bill.dateBs}</td>
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
      <td className={cellClass}>
        {bill.noName ? (
          <select
            aria-label="Account"
            className={inputClass}
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
          >
            <option value="">Choose account…</option>
            {accountsFor(bill.kind, accounts).map((p) => (
              <option key={p._id} value={p._id}>
                {p.displayName}
                {p.tag ? ` · ${p.tag}` : ""}
              </option>
            ))}
          </select>
        ) : (
          (bill.partyName ?? "—")
        )}
      </td>
      <td className={cellClass}>
        {bill.noAmount ? (
          <input
            aria-label="Amount in rupees"
            inputMode="numeric"
            placeholder="Rs"
            className={`${inputClass} w-28`}
            value={rupees}
            onChange={(e) => setRupees(e.target.value.trim())}
          />
        ) : (
          formatNpr(bill.amountPaisa ?? 0, { locale: "en" })
        )}
      </td>
      <td className={`${cellClass} text-right`}>
        <Button tone="sale" disabled={!ready || saving || !online} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </td>
    </tr>
  );
}

/** F-11 Needs attention: bills without an amount or a name, newest first, fixed in place. */
export function NeedsAttention() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.billQueries.listForAdmin,
    { filter: "attention" },
    { initialNumItems: 20 },
  );
  const accounts = useQuery(api.partyAdmin.list, {});
  return (
    <Panel
      title="Needs attention"
      aside={
        status === "LoadingFirstPage"
          ? ""
          : `${results.length}${status === "CanLoadMore" ? "+" : ""}`
      }
    >
      <Table head={["Date", "", "Type", "Account", "Amount", ""]}>
        {status === "LoadingFirstPage" ? (
          <SkeletonRows columns={6} rows={3} />
        ) : results.length === 0 ? (
          <EmptyRow columns={6}>
            Nothing needs attention. Every bill has an amount and a name.
          </EmptyRow>
        ) : (
          results.map((bill) => <AttentionRow key={bill._id} bill={bill} accounts={accounts} />)
        )}
      </Table>
      {status === "CanLoadMore" ? (
        <div className="p-3 text-center">
          <Button tone="ghost" onClick={() => loadMore(20)}>
            Show more
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

/** F-12 / UC-09: probable duplicates (same name across scripts, or same phone), merged in place. */
export function Duplicates() {
  const pairs = useQuery(api.partyAdmin.duplicates, {});
  const merge = useMutation(api.partyAdmin.merge);
  const showError = useShowError();
  const online = useConnection();
  return (
    <Panel title="Possible duplicates" aside="same name or phone">
      <Table head={["Keep", "", "Merge into it", "Why", ""]}>
        {pairs === undefined ? (
          <SkeletonRows columns={5} rows={2} />
        ) : pairs.length === 0 ? (
          <EmptyRow columns={5}>No likely duplicates.</EmptyRow>
        ) : (
          pairs.map((p) => (
            <tr key={`${p.keepId}|${p.mergeId}`} className={rowClass}>
              <td className={cellClass}>
                {p.keepName} <small className="text-ink-soft">({p.keepBills} bills)</small>
              </td>
              <td className={cellClass}>←</td>
              <td className={cellClass}>
                {p.mergeName} <small className="text-ink-soft">({p.mergeBills} bills)</small>
              </td>
              <td className={cellClass}>{p.reason === "phone" ? "same phone" : "same name"}</td>
              <td className={`${cellClass} text-right`}>
                <Button
                  disabled={!online}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Merge "${p.mergeName}" into "${p.keepName}"? Its ${p.mergeBills} bills move; nothing is deleted.`,
                      )
                    )
                      return;
                    merge({ keepId: p.keepId, mergeId: p.mergeId }).catch(showError);
                  }}
                >
                  Merge
                </Button>
              </td>
            </tr>
          ))
        )}
      </Table>
    </Panel>
  );
}
