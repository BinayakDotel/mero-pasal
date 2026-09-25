import { diffDaysBs, isValidBs } from "@mero-pasal/shared/dates";
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

const MAX_RANGE_DAYS = 62;

/**
 * F-11 overview: the billed totals of a BS date range (inclusive), e.g. a month. Reads at most
 * 62 daily rows (architecture §6: "≤ 400 rows read").
 */
export const forRange = memberQuery({
  args: { fromBs: v.string(), toBs: v.string() },
  returns: v.object({
    saleCount: v.number(),
    salePaisa: v.number(),
    purchaseCount: v.number(),
    purchasePaisa: v.number(),
    missingAmountCount: v.number(),
    days: v.number(),
  }),
  handler: async (ctx, { fromBs, toBs }) => {
    if (!isValidBs(fromBs) || !isValidBs(toBs))
      throw appError("VALIDATION", "Dates must be real YYYY-MM-DD BS dates");
    const span = diffDaysBs(fromBs, toBs);
    if (span < 0 || span >= MAX_RANGE_DAYS) {
      throw appError("VALIDATION", `A range is 1–${MAX_RANGE_DAYS} days`);
    }
    const rows = await ctx.db
      .query("dailySummaries")
      .withIndex("by_shop_date", (q) =>
        q.eq("shopId", ctx.shopId).gte("dateBs", fromBs).lte("dateBs", toBs),
      )
      .take(MAX_RANGE_DAYS);
    const total = {
      saleCount: 0,
      salePaisa: 0,
      purchaseCount: 0,
      purchasePaisa: 0,
      missingAmountCount: 0,
      days: rows.length,
    };
    for (const r of rows) {
      total.saleCount += r.saleCount;
      total.salePaisa += r.salePaisa;
      total.purchaseCount += r.purchaseCount;
      total.purchasePaisa += r.purchasePaisa;
      total.missingAmountCount += r.missingAmountCount;
    }
    return total;
  },
});
