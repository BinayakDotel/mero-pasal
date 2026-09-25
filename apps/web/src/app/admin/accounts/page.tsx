"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { type Account, AccountDialog } from "@/features/admin/account-dialog";
import { filterAccounts } from "@/features/admin/account-filter";
import { PageHead } from "@/features/admin/admin-shell";
import { Duplicates } from "@/features/admin/attention";
import { rs } from "@/features/admin/format";
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
} from "@/features/admin/ui";
import { useConnection } from "@/features/sync/use-connection";

const KIND = { customer: "Customer", supplier: "Supplier", both: "Both" } as const;
const COLUMNS = 9;

/** A merge still moving bills: running, or stuck after a failed batch. Both actions are safe. */
function MergingCell({ account, into }: { account: Account; into: string }) {
  const resume = useMutation(api.partyAdmin.resumeMerge);
  const stop = useMutation(api.partyAdmin.stopMerge);
  const showError = useShowError();
  const online = useConnection();
  return (
    <span className="flex items-center gap-2">
      <span className="font-semibold text-bahi">Merging into {into}…</span>
      <Button
        tone="ghost"
        className="h-8"
        disabled={!online}
        onClick={(e) => {
          e.stopPropagation();
          resume({ mergeId: account._id }).catch(showError);
        }}
      >
        Resume
      </Button>
      <Button
        tone="ghost"
        className="h-8"
        disabled={!online}
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm("Stop this merge? Bills already moved stay moved.")) {
            stop({ mergeId: account._id }).catch(showError);
          }
        }}
      >
        Stop
      </Button>
    </span>
  );
}

/** F-12 accounts: search in either script, edit, archive, merge; duplicates on top (UC-09). */
export default function AdminAccountsPage() {
  const accounts = useQuery(api.partyAdmin.list, {});
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [merged, setMerged] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useMemo(
    () => filterAccounts(accounts ?? [], { query, archived, merged }),
    [accounts, query, archived, merged],
  );
  const nameOf = (id: string | undefined) =>
    accounts?.find((p) => p._id === id)?.displayName ?? "another account";
  const open = accounts?.find((p) => p._id === openId);

  return (
    <>
      <PageHead title="Accounts">
        <input
          aria-label="Search accounts"
          placeholder="Name (any script), tag or phone"
          className={`${inputClass} w-72`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="flex items-center gap-1.5 font-semibold">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Archived
        </label>
        <label className="flex items-center gap-1.5 font-semibold">
          <input type="checkbox" checked={merged} onChange={(e) => setMerged(e.target.checked)} />
          Merged
        </label>
      </PageHead>
      <div className="grid gap-5.5">
        <Duplicates />
        <Panel title="Accounts" aside={accounts ? `${rows.length} of ${accounts.length}` : ""}>
          <Table
            head={[
              "Name",
              "Other script",
              "Tag",
              "Phone",
              "Kind",
              "Bills",
              "Sold",
              "Bought",
              "Status",
            ]}
          >
            {accounts === undefined ? (
              <SkeletonRows columns={COLUMNS} rows={8} />
            ) : rows.length === 0 ? (
              <EmptyRow columns={COLUMNS}>No accounts match.</EmptyRow>
            ) : (
              rows.map((p) => {
                const editable = !p.isWalkIn && !p.mergedIntoId && !p.mergingInto;
                const other = p.displayName === p.nameLatin ? p.nameDevanagari : p.nameLatin;
                return (
                  <tr
                    key={p._id}
                    onClick={editable ? () => setOpenId(p._id) : undefined}
                    onKeyDown={editable ? (e) => e.key === "Enter" && setOpenId(p._id) : undefined}
                    tabIndex={editable ? 0 : undefined}
                    className={`${rowClass} ${editable ? "cursor-pointer hover:bg-paper" : "text-ink-soft"}`}
                  >
                    <td className={`${cellClass} font-semibold`}>{p.displayName}</td>
                    <td className={cellClass}>{other ?? "—"}</td>
                    <td className={cellClass}>{p.tag ?? ""}</td>
                    <td className={cellClass}>{p.phone ?? ""}</td>
                    <td className={cellClass}>{KIND[p.kind]}</td>
                    <td className={cellClass}>{p.billCount}</td>
                    <td className={cellClass}>{p.salePaisa ? rs(p.salePaisa) : ""}</td>
                    <td className={cellClass}>{p.purchasePaisa ? rs(p.purchasePaisa) : ""}</td>
                    <td className={cellClass}>
                      {p.mergingInto ? (
                        <MergingCell account={p} into={nameOf(p.mergingInto)} />
                      ) : p.mergedIntoId ? (
                        `merged into ${nameOf(p.mergedIntoId)}`
                      ) : p.isWalkIn ? (
                        "walk-in"
                      ) : p.archived ? (
                        "archived"
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </Table>
        </Panel>
      </div>
      {open && accounts ? (
        <AccountDialog account={open} accounts={accounts} onClose={() => setOpenId(null)} />
      ) : null}
    </>
  );
}
