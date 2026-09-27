"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { monthOf } from "@mero-pasal/shared/dates";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";
import { otherScript } from "@/features/accounts/profile";
import { AccountDialog } from "@/features/admin/account-dialog";
import { PageHead } from "@/features/admin/admin-shell";
import { BillDrawer } from "@/features/admin/bill-drawer";
import { type AdminBill, BillsTable } from "@/features/admin/bills-table";
import { rs, whenNpt } from "@/features/admin/format";
import { MergingCell } from "@/features/admin/merge-status";
import { Button, cellClass, Panel, rowClass, Table } from "@/features/admin/ui";
import { useTodayBs } from "@/features/today/use-today-bs";

const KIND = { customer: "Customer", supplier: "Supplier", both: "Customer and supplier" } as const;

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-rule/70 px-4 py-2 last:border-b-0">
      <dt className="w-28 flex-none text-ink-soft">{label}</dt>
      <dd className="min-w-0 font-semibold break-words">{children}</dd>
    </div>
  );
}

/**
 * F-12 account profile (added 2026-09-27): details, totals, the account's bills (a row opens the
 * bill drawer), its change history, and Edit / Archive / Merge.
 */
export default function AdminAccountPage() {
  const { id } = useParams<{ id: string }>();
  const thisMonth = monthOf(useTodayBs());
  const accounts = useQuery(api.partyAdmin.list, {});
  // Look it up in the list first: a bad id in the URL must say "not found", not crash the page.
  const row = accounts?.find((p) => p._id === id);
  const partyId = row?._id as Id<"parties"> | undefined;
  const profile = useQuery(api.parties.get, partyId ? { id: partyId, monthBs: thisMonth } : "skip");
  const history = useQuery(
    api.audit.listForEntity,
    partyId ? { entity: "party", entityId: partyId } : "skip",
  );
  const [editing, setEditing] = useState(false);
  const [openBill, setOpenBill] = useState<string | null>(null);
  const onOpen = useCallback((bill: AdminBill) => setOpenBill(bill.clientId), []);
  const onClose = useCallback(() => setOpenBill(null), []);
  const nameOf = (other: string | undefined) =>
    accounts?.find((p) => p._id === other)?.displayName ?? "another account";

  if (accounts !== undefined && !row) {
    return (
      <>
        <PageHead title="Account not found" />
        <p>
          It may have been removed.{" "}
          <Link href="/admin/accounts" className="font-semibold underline">
            Back to accounts
          </Link>
        </p>
      </>
    );
  }
  if (!row || !profile) {
    return <div aria-busy="true" className="h-60 animate-pulse rounded-xl bg-rule/40" />;
  }

  const editable = !row.isWalkIn && !row.mergedIntoId && !row.mergingInto;
  const other = otherScript(row);
  return (
    <>
      <p className="mb-1 text-[13px]">
        <Link href="/admin/accounts" className="text-ink-soft underline">
          ← Accounts
        </Link>
      </p>
      <PageHead title={row.tag ? `${row.displayName} · ${row.tag}` : row.displayName}>
        {editable ? (
          <Button tone="primary" onClick={() => setEditing(true)}>
            Edit, archive or merge
          </Button>
        ) : null}
      </PageHead>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-5.5">
        <div className="min-w-0">
          <BillsTable thisMonth={thisMonth} onOpen={onOpen} fixedPartyId={row._id} />
        </div>
        <div className="grid gap-5.5">
          <Panel title="Details">
            <dl className="py-1">
              {other ? <Detail label="Other script">{other}</Detail> : null}
              <Detail label="Phone">
                {row.phone ? <a href={`tel:${row.phone}`}>{row.phone}</a> : "—"}
              </Detail>
              <Detail label="Tag">{row.tag ?? "—"}</Detail>
              <Detail label="PAN">{row.pan ?? "—"}</Detail>
              <Detail label="Kind">{row.isWalkIn ? "Walk-in" : KIND[row.kind]}</Detail>
              <Detail label="Added">{whenNpt(profile.createdAt)}</Detail>
              <Detail label="First bill">{profile.firstBillDateBs ?? "—"}</Detail>
              <Detail label="Last bill">{profile.lastBillDateBs ?? "—"}</Detail>
              <Detail label="Status">
                {row.mergingInto ? (
                  <MergingCell mergeId={row._id} into={nameOf(row.mergingInto)} />
                ) : row.mergedIntoId ? (
                  <>
                    Merged into{" "}
                    <Link href={`/admin/accounts/${row.mergedIntoId}`} className="underline">
                      {nameOf(row.mergedIntoId)}
                    </Link>
                  </>
                ) : row.archived ? (
                  "Archived (hidden from the name picker)"
                ) : (
                  "Active"
                )}
              </Detail>
            </dl>
          </Panel>
          <Panel title="Totals">
            <Table head={["", "Sold", "Bought", "Bills"]}>
              {(
                [
                  ["This month", profile.month],
                  ["All time", profile.allTime],
                ] as const
              ).map(([label, t]) => (
                <tr key={label} className={rowClass}>
                  <td className={cellClass}>{label}</td>
                  <td className={cellClass}>{rs(t.salePaisa)}</td>
                  <td className={cellClass}>{rs(t.purchasePaisa)}</td>
                  <td className={cellClass}>{t.billCount}</td>
                </tr>
              ))}
            </Table>
          </Panel>
          <Panel title="History">
            {history === undefined ? (
              <p className="p-4 text-ink-soft">Loading…</p>
            ) : history.length === 0 ? (
              <p className="p-4 text-ink-soft">No changes yet.</p>
            ) : (
              <ol className="grid gap-2 p-4">
                {history.map((h, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: an append-only log, newest first
                  <li key={i} className="border-b border-rule/70 pb-2 text-[14px] last:border-b-0">
                    <b>{h.actorName || "—"}</b> · {whenNpt(h.at)} · <code>{h.action}</code>
                    <div className="text-ink-soft">{h.summary}</div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
      {editing && accounts ? (
        <AccountDialog account={row} accounts={accounts} onClose={() => setEditing(false)} />
      ) : null}
      {openBill ? <BillDrawer key={openBill} clientId={openBill} onClose={onClose} /> : null}
    </>
  );
}
