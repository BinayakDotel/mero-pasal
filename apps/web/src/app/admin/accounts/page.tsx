"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { filterAccounts } from "@/features/admin/account-filter";
import { PageHead } from "@/features/admin/admin-shell";
import { Duplicates } from "@/features/admin/attention";
import { DeletingCell } from "@/features/admin/delete-account";
import { rs } from "@/features/admin/format";
import { MergingCell } from "@/features/admin/merge-status";
import {
  cellClass,
  EmptyRow,
  inputClass,
  Panel,
  rowClass,
  SkeletonRows,
  Table,
} from "@/features/admin/ui";

const KIND = { customer: "Customer", supplier: "Supplier", both: "Both" } as const;
const COLUMNS = 9;

/**
 * F-12 accounts: search in either script; a row opens the account's profile; duplicates on top
 * (UC-09). Archived, merged and deleted accounts show on request.
 */
export default function AdminAccountsPage() {
  const accounts = useQuery(api.partyAdmin.list, {});
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [merged, setMerged] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const router = useRouter();
  const rows = useMemo(
    () => filterAccounts(accounts ?? [], { query, archived, merged, deleted }),
    [accounts, query, archived, merged, deleted],
  );
  const nameOf = (id: string | undefined) =>
    accounts?.find((p) => p._id === id)?.displayName ?? "another account";

  return (
    <>
      <PageHead title="Accounts">
        <input
          aria-label="Search accounts"
          data-admin-search
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
        <label className="flex items-center gap-1.5 font-semibold">
          <input type="checkbox" checked={deleted} onChange={(e) => setDeleted(e.target.checked)} />
          Deleted
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
                const other = p.displayName === p.nameLatin ? p.nameDevanagari : p.nameLatin;
                return (
                  <tr
                    key={p._id}
                    onClick={() => router.push(`/admin/accounts/${p._id}`)}
                    className={`${rowClass} cursor-pointer hover:bg-paper ${p.mergedIntoId || p.archived || p.deletedAt ? "text-ink-soft" : ""}`}
                  >
                    <td className={`${cellClass} font-semibold`}>
                      <Link href={`/admin/accounts/${p._id}`} onClick={(e) => e.stopPropagation()}>
                        {p.displayName}
                      </Link>
                    </td>
                    <td className={cellClass}>{other ?? "—"}</td>
                    <td className={cellClass}>{p.tag ?? ""}</td>
                    <td className={cellClass}>{p.phone ?? ""}</td>
                    <td className={cellClass}>{KIND[p.kind]}</td>
                    <td className={cellClass}>{p.billCount}</td>
                    <td className={cellClass}>{p.salePaisa ? rs(p.salePaisa) : ""}</td>
                    <td className={cellClass}>{p.purchasePaisa ? rs(p.purchasePaisa) : ""}</td>
                    <td className={cellClass}>
                      {p.mergingInto ? (
                        <MergingCell mergeId={p._id} into={nameOf(p.mergingInto)} />
                      ) : p.mergedIntoId ? (
                        `merged into ${nameOf(p.mergedIntoId)}`
                      ) : p.deletingAt !== undefined ? (
                        <DeletingCell id={p._id} />
                      ) : p.deletedAt !== undefined ? (
                        "deleted"
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
    </>
  );
}
