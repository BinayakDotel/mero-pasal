import { v } from "convex/values";
import { adminQuery } from "./lib/functions";

const MAX_ENTRIES = 100;

/**
 * F-15: one record's history for the admin bill drawer (M4), newest first: who, what, when and
 * the short before/after summary. This shop's entries only.
 */
export const listForEntity = adminQuery({
  args: {
    entity: v.union(
      v.literal("transaction"),
      v.literal("party"),
      v.literal("member"),
      v.literal("dayClose"),
    ),
    entityId: v.string(),
  },
  returns: v.array(
    v.object({
      action: v.string(),
      summary: v.string(),
      at: v.number(),
      actorName: v.string(),
    }),
  ),
  handler: async (ctx, { entity, entityId }) => {
    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_entity", (q) => q.eq("entity", entity).eq("entityId", entityId))
      .order("desc")
      .take(MAX_ENTRIES);
    return Promise.all(
      rows
        .filter((row) => row.shopId === ctx.shopId)
        .map(async (row) => ({
          action: row.action,
          summary: row.summary,
          at: row.at,
          actorName: (await ctx.db.get(row.actorId))?.displayName ?? "",
        })),
    );
  },
});
