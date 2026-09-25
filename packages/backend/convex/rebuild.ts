import { diffDaysBs, isValidBs, monthOf } from "@mero-pasal/shared/dates";
import { contribution } from "@mero-pasal/shared/ledger";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { isBill } from "./lib/billRow";
import { appError } from "./lib/errors";

// NFR-10 repair tool (architecture §6): recompute derived totals from the bills themselves,
// if they ever drift. Rebuild the months that drifted (a ledger error naming
// "partyMonthly[<account>/2083-06]" or "dailySummaries[2083-06-09]" says which): account totals
// are summed from ALL month rows, so every drifted month must be rebuilt. Then resume any stuck
// merge. Run by a human, e.g. on dev:
//   pnpm --filter @mero-pasal/backend exec convex run rebuild:summaries '{"fromBs":"2083-06-01","toBs":"2083-06-30"}'

const MAX_DAYS = 62;
const MAX_BILLS = 8000;
const MAX_PARTIES = 2000;
const PARTY_PAGE = 50; // × up to 1200 month rows: well inside a transaction's read limit
const MAX_MONTHS = 1200; // a century of month rows per account

/**
 * Rebuilds, for one shop (the only one when not given): the daily totals of [fromBs, toBs];
 * each account's monthly totals for the months those days touch; then (scheduled, page by page)
 * every account's all-time totals from its monthly rows. Returns what it rewrote.
 */
export const summaries = internalMutation({
  args: { fromBs: v.string(), toBs: v.string(), shopId: v.optional(v.id("shops")) },
  returns: v.object({ days: v.number(), months: v.number() }),
  handler: async (ctx, { fromBs, toBs, shopId: given }) => {
    if (!isValidBs(fromBs) || !isValidBs(toBs)) throw appError("VALIDATION", "Not a real BS date");
    const span = diffDaysBs(fromBs, toBs);
    if (span < 0 || span >= MAX_DAYS) throw appError("VALIDATION", `1–${MAX_DAYS} days at a time`);
    const shops = await ctx.db.query("shops").take(2);
    const shopId: Id<"shops"> | undefined =
      given ?? (shops.length === 1 ? shops[0]?._id : undefined);
    if (!shopId) throw appError("VALIDATION", "Say which shop (shopId)");

    // Whole months, so each account's month rows can be rewritten from complete data.
    const firstMonth = monthOf(fromBs);
    const lastMonth = monthOf(toBs);
    const bills = (
      await ctx.db
        .query("transactions")
        .withIndex("by_shop_status_date", (q) =>
          q
            .eq("shopId", shopId)
            .eq("status", "active")
            .gt("dateBs", `${firstMonth}-00`)
            .lt("dateBs", `${lastMonth}-33`),
        )
        .take(MAX_BILLS + 1)
    ).filter(isBill);
    if (bills.length > MAX_BILLS)
      throw appError("VALIDATION", "Too many bills; use a shorter range");

    const daily = new Map<
      string,
      {
        saleCount: number;
        salePaisa: number;
        purchaseCount: number;
        purchasePaisa: number;
        missingAmountCount: number;
      }
    >();
    const monthly = new Map<
      string,
      {
        partyId: Id<"parties">;
        monthBs: string;
        billCount: number;
        salePaisa: number;
        purchasePaisa: number;
      }
    >();
    for (const tx of bills) {
      const c = contribution({
        kind: tx.kind,
        status: tx.status,
        dateBs: tx.dateBs,
        partyId: tx.partyId,
        amountPaisa: tx.amountPaisa,
      });
      if (c.daily && tx.dateBs >= fromBs && tx.dateBs <= toBs) {
        const d = daily.get(c.daily.dateBs) ?? {
          saleCount: 0,
          salePaisa: 0,
          purchaseCount: 0,
          purchasePaisa: 0,
          missingAmountCount: 0,
        };
        for (const k of Object.keys(d) as (keyof typeof d)[]) d[k] += c.daily.delta[k];
        daily.set(c.daily.dateBs, d);
      }
      if (c.monthly) {
        const key = `${c.monthly.partyId}|${c.monthly.monthBs}`;
        const m = monthly.get(key) ?? {
          partyId: c.monthly.partyId,
          monthBs: c.monthly.monthBs,
          billCount: 0,
          salePaisa: 0,
          purchasePaisa: 0,
        };
        m.billCount += c.monthly.delta.billCount;
        m.salePaisa += c.monthly.delta.salePaisa;
        m.purchasePaisa += c.monthly.delta.purchasePaisa;
        monthly.set(key, m);
      }
    }

    // Daily rows of the range: replace.
    const oldDays = await ctx.db
      .query("dailySummaries")
      .withIndex("by_shop_date", (q) =>
        q.eq("shopId", shopId).gte("dateBs", fromBs).lte("dateBs", toBs),
      )
      .take(MAX_DAYS);
    for (const row of oldDays) await ctx.db.delete(row._id);
    for (const [dateBs, d] of daily)
      await ctx.db.insert("dailySummaries", { shopId, dateBs, ...d });

    // Month rows of the touched months: replace.
    const months = new Set<string>();
    for (let m = firstMonth; m <= lastMonth; ) {
      months.add(m);
      const [y, mm] = m.split("-").map(Number) as [number, number];
      m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
    }
    for (const monthBs of months) {
      const old = await ctx.db
        .query("partyMonthly")
        .withIndex("by_shop_month", (q) => q.eq("shopId", shopId).eq("monthBs", monthBs))
        .take(MAX_PARTIES);
      for (const row of old) await ctx.db.delete(row._id);
    }
    for (const m of monthly.values()) await ctx.db.insert("partyMonthly", { shopId, ...m });

    // All-time account totals: the sum of their month rows, a page of accounts at a time.
    await ctx.scheduler.runAfter(0, internal.rebuild.partyTotals, { shopId, cursor: null });
    return { days: daily.size, months: months.size };
  },
});

/**
 * Every account's all-time totals = the sum of its month rows. One page of accounts per
 * transaction (bounded reads), then the next page is scheduled. Paged by clientId, which never
 * changes, so bills saved meanwhile can't reorder the accounts. Safe to run any time: each page
 * reads and writes an account's rows in one transaction.
 */
export const partyTotals = internalMutation({
  args: {
    shopId: v.id("shops"),
    cursor: v.union(v.string(), v.null()),
    pageSize: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { shopId, cursor, pageSize }) => {
    const page = await ctx.db
      .query("parties")
      .withIndex("by_shop_clientId", (q) => q.eq("shopId", shopId))
      .paginate({ cursor, numItems: pageSize ?? PARTY_PAGE });
    for (const p of page.page) {
      const rows = await ctx.db
        .query("partyMonthly")
        .withIndex("by_party_month", (q) => q.eq("partyId", p._id))
        .take(MAX_MONTHS);
      const total = rows.reduce(
        (t, r) => ({
          billCount: t.billCount + r.billCount,
          salePaisa: t.salePaisa + r.salePaisa,
          purchasePaisa: t.purchasePaisa + r.purchasePaisa,
        }),
        { billCount: 0, salePaisa: 0, purchasePaisa: 0 },
      );
      if (
        total.billCount !== p.billCount ||
        total.salePaisa !== p.salePaisa ||
        total.purchasePaisa !== p.purchasePaisa
      ) {
        await ctx.db.patch(p._id, total);
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.rebuild.partyTotals, {
        shopId,
        cursor: page.continueCursor,
        ...(pageSize === undefined ? {} : { pageSize }),
      });
    }
    return null;
  },
});
