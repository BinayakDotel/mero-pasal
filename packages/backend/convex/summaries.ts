import { isValidBs } from "@mero-pasal/shared/dates";
import { v } from "convex/values";
import { appError } from "./lib/errors";
import { memberQuery } from "./lib/functions";

const dayTotals = v.object({
  saleCount: v.number(),
  salePaisa: v.number(),
  purchaseCount: v.number(),
  purchasePaisa: v.number(),
  missingAmountCount: v.number(),
});

/**
 * F-02 Today strip: one day's billed totals (zeros when nothing was billed). The client passes
 * `dateBs`: queries never compute "today" themselves (architecture §7.2).
 */
export const forDate = memberQuery({
  args: { dateBs: v.string() },
  returns: dayTotals,
  handler: async (ctx, { dateBs }) => {
    if (!isValidBs(dateBs))
      throw appError("VALIDATION", "dateBs must be a real YYYY-MM-DD BS date");
    const row = await ctx.db
      .query("dailySummaries")
      .withIndex("by_shop_date", (q) => q.eq("shopId", ctx.shopId).eq("dateBs", dateBs))
      .unique();
    return {
      saleCount: row?.saleCount ?? 0,
      salePaisa: row?.salePaisa ?? 0,
      purchaseCount: row?.purchaseCount ?? 0,
      purchasePaisa: row?.purchasePaisa ?? 0,
      missingAmountCount: row?.missingAmountCount ?? 0,
    };
  },
});
