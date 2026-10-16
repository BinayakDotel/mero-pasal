import { isValidBs } from "@mero-pasal/shared/dates";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { isBill } from "./lib/billRow";
import { appError } from "./lib/errors";
import { DELETED_WITH_ACCOUNT } from "./lib/parties";

// M5 field trial (progress tracker → Trial metrics): one day's numbers to compare with the paper
// bill book. Read-only. Binayak runs it himself, e.g. on production (docs/go-live.md):
//   pnpm --filter @mero-pasal/backend exec convex run --prod trial:day '{"dateBs":"2083-06-10"}'

const MAX_DAY_BILLS = 2000;

export const day = internalQuery({
  args: { dateBs: v.string(), shopId: v.optional(v.id("shops")) },
  returns: v.object({
    dateBs: v.string(),
    bills: v.number(),
    sold: v.number(),
    bought: v.number(),
    soldPaisa: v.number(),
    boughtPaisa: v.number(),
    noAmount: v.number(),
    noName: v.number(),
    removed: v.number(),
    byMember: v.array(v.object({ name: v.string(), bills: v.number() })),
  }),
  handler: async (ctx, { dateBs, shopId: given }) => {
    if (!isValidBs(dateBs)) throw appError("VALIDATION", "Not a real BS date");
    const shops = await ctx.db.query("shops").take(2);
    const shopId: Id<"shops"> | undefined =
      given ?? (shops.length === 1 ? shops[0]?._id : undefined);
    if (!shopId) throw appError("VALIDATION", "Say which shop (shopId)");
    const of = (status: "active" | "deleted") =>
      ctx.db
        .query("transactions")
        .withIndex("by_shop_status_date", (q) =>
          q.eq("shopId", shopId).eq("status", status).eq("dateBs", dateBs),
        )
        .take(MAX_DAY_BILLS);
    const active = (await of("active")).filter(isBill);
    // Bills Buwa (or the admin) removed; not those that went with a deleted account (ADR-037).
    const removed = (await of("deleted")).filter(
      (b) => isBill(b) && b.deletedReason !== DELETED_WITH_ACCOUNT,
    );
    const sales = active.filter((b) => b.kind === "sale");
    const purchases = active.filter((b) => b.kind === "purchase");
    const sum = (rows: typeof active) => rows.reduce((t, b) => t + (b.amountPaisa ?? 0), 0);
    const counts = new Map<string, number>();
    for (const b of active) counts.set(b.createdBy, (counts.get(b.createdBy) ?? 0) + 1);
    const byMember = [];
    for (const [memberId, bills] of counts) {
      const member = await ctx.db.get(memberId as Id<"members">);
      byMember.push({ name: member?.displayName ?? "?", bills });
    }
    return {
      dateBs,
      bills: active.length,
      sold: sales.length,
      bought: purchases.length,
      soldPaisa: sum(sales),
      boughtPaisa: sum(purchases),
      noAmount: active.filter((b) => b.amountPaisa === undefined).length,
      noName: active.filter((b) => b.partyId === undefined).length,
      removed: removed.length,
      byMember: byMember.sort((a, b) => b.bills - a.bills),
    };
  },
});
