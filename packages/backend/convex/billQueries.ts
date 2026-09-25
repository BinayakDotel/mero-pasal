import { isValidBs } from "@mero-pasal/shared/dates";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { billRow, isBill, toBillRow } from "./lib/billRow";
import { appError } from "./lib/errors";
import { adminQuery } from "./lib/functions";

// F-11 admin bill lists: every bill (removed ones too), with what the admin table shows.

const adminBillRow = v.object({
  ...billRow.fields,
  status: v.union(v.literal("active"), v.literal("deleted")),
  pages: v.number(),
  billNumber: v.optional(v.string()),
  capturedByName: v.string(),
  noAmount: v.boolean(),
  noName: v.boolean(),
  /** The version shown; admin saves send it back (billAdmin.update expectedUpdatedAt). */
  updatedAt: v.number(),
});

async function toAdminRow(
  ctx: QueryCtx,
  row: Doc<"transactions"> & { kind: "sale" | "purchase" },
  names: Map<string, string>,
) {
  const base = await toBillRow(ctx, row);
  let by = names.get(row.createdBy);
  if (by === undefined) {
    by = (await ctx.db.get(row.createdBy))?.displayName ?? "";
    names.set(row.createdBy, by);
  }
  return {
    ...base,
    status: row.status,
    pages: row.photos.length,
    ...(row.billNumber === undefined ? {} : { billNumber: row.billNumber }),
    capturedByName: by,
    noAmount: row.amountPaisa === undefined,
    noName: row.partyId === undefined,
    updatedAt: row.updatedAt,
  };
}

/**
 * F-11 bills table: filter by type, "needs attention" (no amount or no name) or removed, and
 * optionally a BS date range or one account; newest first, a page at a time.
 */
export const listForAdmin = adminQuery({
  args: {
    filter: v.union(
      v.literal("all"),
      v.literal("sale"),
      v.literal("purchase"),
      v.literal("attention"),
      v.literal("removed"),
    ),
    fromBs: v.optional(v.string()),
    toBs: v.optional(v.string()),
    partyId: v.optional(v.id("parties")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(adminBillRow),
  handler: async (ctx, { filter, fromBs, toBs, partyId, paginationOpts }) => {
    for (const d of [fromBs, toBs]) {
      if (d !== undefined && !isValidBs(d)) throw appError("VALIDATION", "Not a real BS date");
    }
    const { shopId } = ctx;
    const from = fromBs ?? "0000-00-00";
    const to = toBs ?? "9999-99-99";
    const base = ctx.db.query("transactions");
    const query = partyId
      ? base
          .withIndex("by_shop_party_date", (q) =>
            q.eq("shopId", shopId).eq("partyId", partyId).gte("dateBs", from).lte("dateBs", to),
          )
          .filter((q) =>
            filter === "removed"
              ? q.eq(q.field("status"), "deleted")
              : filter === "attention"
                ? q.eq(q.field("needsAttention"), true)
                : filter === "all"
                  ? q.eq(q.field("status"), "active")
                  : q.and(q.eq(q.field("status"), "active"), q.eq(q.field("kind"), filter)),
          )
      : filter === "attention"
        ? base.withIndex("by_shop_attention_date", (q) =>
            q.eq("shopId", shopId).eq("needsAttention", true).gte("dateBs", from).lte("dateBs", to),
          )
        : filter === "sale" || filter === "purchase"
          ? base.withIndex("by_shop_status_kind_date", (q) =>
              q
                .eq("shopId", shopId)
                .eq("status", "active")
                .eq("kind", filter)
                .gte("dateBs", from)
                .lte("dateBs", to),
            )
          : base.withIndex("by_shop_status_date", (q) =>
              q
                .eq("shopId", shopId)
                .eq("status", filter === "removed" ? "deleted" : "active")
                .gte("dateBs", from)
                .lte("dateBs", to),
            );
    const result = await query.order("desc").paginate(paginationOpts);
    const names = new Map<string, string>();
    const page = [];
    for (const row of result.page) if (isBill(row)) page.push(await toAdminRow(ctx, row, names));
    return { ...result, page };
  },
});
