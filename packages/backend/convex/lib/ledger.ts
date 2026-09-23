import { type LedgerTx, ledgerChanges, needsAttention } from "@mero-pasal/shared/ledger";
import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { writeAudit } from "./audit";
import { appError } from "./errors";

// Architecture §7.4 / ADR-013. `apply` is the ONLY code that writes `transactions`
// (AGENTS.md rule 5, code-standard §3.5). In one mutation it writes the bill, applies
// `ledgerChanges(before, after)` to dailySummaries, partyMonthly and party totals, refreshes
// each touched account's last bill (ADR-030), and writes the audit entry. Soft delete only:
// removing is `after = {...before, status: "deleted"}`.

export type TxDoc = Doc<"transactions">;
/** A transaction as callers describe it; `needsAttention` and `updatedAt` are set here. */
export type TxDraft = Omit<WithoutSystemFields<TxDoc>, "needsAttention" | "updatedAt">;

const toLedger = (tx: TxDraft): LedgerTx<Id<"parties">> => ({
  kind: tx.kind,
  status: tx.status,
  dateBs: tx.dateBs,
  partyId: tx.partyId,
  amountPaisa: tx.amountPaisa,
});

function assertNonNegative(row: Record<string, unknown>, what: string): void {
  for (const [field, value] of Object.entries(row)) {
    if (typeof value === "number" && value < 0) {
      // Only reachable if derived data had already drifted; refuse to make it worse.
      throw new Error(`Ledger invariant: ${what}.${field} would become ${value}`);
    }
  }
}

async function requireUsableParty(ctx: MutationCtx, tx: TxDraft): Promise<void> {
  if (tx.partyId === undefined) return;
  const party = await ctx.db.get(tx.partyId);
  if (!party || party.shopId !== tx.shopId) throw appError("NOT_FOUND", "Account not found");
  if (party.mergedIntoId !== undefined && tx.status === "active") {
    // Architecture §5.3 invariant 7: callers resolve merges before calling apply.
    throw appError("CONFLICT", "Account was merged; use the account it was merged into");
  }
}

/** ADR-030: the latest active bill of an account (by date, then capture order). */
async function refreshLastBill(ctx: MutationCtx, shopId: Id<"shops">, partyId: Id<"parties">) {
  const latest = await ctx.db
    .query("transactions")
    .withIndex("by_shop_party_status_date", (q) =>
      q.eq("shopId", shopId).eq("partyId", partyId).eq("status", "active"),
    )
    .order("desc")
    .first();
  await ctx.db.patch(partyId, {
    lastBillDateBs: latest?.dateBs,
    lastBillPaisa: latest?.amountPaisa,
  });
}

/**
 * `ctx` must come from a member wrapper: its `shopId` (the caller's shop, never an argument) is
 * the only shop `apply` will write. `before` is re-read here and must be the stored version, so a
 * stale or foreign copy can't skew the deltas.
 */
export async function apply(
  ctx: MutationCtx & { shopId: Id<"shops"> },
  before: TxDoc | null,
  after: TxDraft,
  audit: { actorId: Id<"members">; action: string; summary: string },
): Promise<Id<"transactions">> {
  if (after.shopId !== ctx.shopId) throw appError("FORBIDDEN", "Not this shop's bill");
  if (before) {
    const stored = await ctx.db.get(before._id);
    if (!stored || stored.shopId !== ctx.shopId) throw appError("NOT_FOUND", "Bill not found");
    if (stored.updatedAt !== before.updatedAt) {
      throw appError("CONFLICT", "The bill changed since it was read; reload and try again");
    }
  }
  // Archived accounts may still receive bills (e.g. an offline save made before archiving);
  // merged ones may not (architecture §5.3 invariant 7).
  await requireUsableParty(ctx, after);

  const now = Date.now();
  const row = {
    ...after,
    // F-11 queue: removed bills never need attention.
    needsAttention: after.status === "active" && needsAttention(after),
    updatedAt: now,
  };
  let id: Id<"transactions">;
  if (before) {
    id = before._id;
    await ctx.db.replace(id, row);
  } else {
    id = await ctx.db.insert("transactions", row);
  }

  const changes = ledgerChanges(before ? toLedger(before) : null, toLedger(after));
  const { shopId } = ctx;

  for (const { dateBs, delta } of changes.daily) {
    const existing = await ctx.db
      .query("dailySummaries")
      .withIndex("by_shop_date", (q) => q.eq("shopId", shopId).eq("dateBs", dateBs))
      .unique();
    const next = {
      saleCount: (existing?.saleCount ?? 0) + delta.saleCount,
      salePaisa: (existing?.salePaisa ?? 0) + delta.salePaisa,
      purchaseCount: (existing?.purchaseCount ?? 0) + delta.purchaseCount,
      purchasePaisa: (existing?.purchasePaisa ?? 0) + delta.purchasePaisa,
      missingAmountCount: (existing?.missingAmountCount ?? 0) + delta.missingAmountCount,
    };
    assertNonNegative(next, `dailySummaries[${dateBs}]`);
    if (existing) await ctx.db.patch(existing._id, next);
    else await ctx.db.insert("dailySummaries", { shopId, dateBs, ...next });
  }

  for (const { partyId, monthBs, delta } of changes.monthly) {
    const existing = await ctx.db
      .query("partyMonthly")
      .withIndex("by_party_month", (q) => q.eq("partyId", partyId).eq("monthBs", monthBs))
      .unique();
    const next = {
      billCount: (existing?.billCount ?? 0) + delta.billCount,
      salePaisa: (existing?.salePaisa ?? 0) + delta.salePaisa,
      purchasePaisa: (existing?.purchasePaisa ?? 0) + delta.purchasePaisa,
    };
    assertNonNegative(next, `partyMonthly[${partyId}/${monthBs}]`);
    if (existing) await ctx.db.patch(existing._id, next);
    else await ctx.db.insert("partyMonthly", { shopId, partyId, monthBs, ...next });
  }

  for (const { partyId, delta } of changes.party) {
    const party = await ctx.db.get(partyId);
    if (!party) throw appError("NOT_FOUND", "Account not found");
    const next = {
      billCount: party.billCount + delta.billCount,
      salePaisa: party.salePaisa + delta.salePaisa,
      purchasePaisa: party.purchasePaisa + delta.purchasePaisa,
    };
    assertNonNegative(next, `parties[${partyId}]`);
    await ctx.db.patch(partyId, next);
  }

  // Recency (F-04 "recent" list) only moves forward: a party is "used" when an active bill
  // lands on it. It is never rewound, so it's excluded from the invariant comparison.
  const gained =
    after.status === "active" &&
    after.partyId !== undefined &&
    (before?.status !== "active" || before.partyId !== after.partyId);
  if (gained && after.partyId) {
    const party = await ctx.db.get(after.partyId);
    if (party && party.lastUsedAt < now) await ctx.db.patch(after.partyId, { lastUsedAt: now });
  }

  const touched = new Set(
    [before?.partyId, after.partyId].filter((p): p is Id<"parties"> => p !== undefined),
  );
  for (const partyId of touched) await refreshLastBill(ctx, shopId, partyId);

  await writeAudit(ctx, {
    shopId,
    actorId: audit.actorId,
    action: audit.action,
    entity: "transaction",
    entityId: id,
    summary: audit.summary,
  });
  return id;
}
