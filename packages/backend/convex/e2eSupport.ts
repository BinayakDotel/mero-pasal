import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

// M2 e2e (plan PR 9): Playwright checks what reached the server through `convex run` against the
// DEV deployment. Internal only: not callable from any client.

/** How many of these phone-made bills exist on the server, and their photo counts. */
export const billsByClientIds = internalQuery({
  args: { clientIds: v.array(v.string()) },
  returns: v.array(v.object({ clientId: v.string(), photos: v.number(), status: v.string() })),
  handler: async (ctx, { clientIds }) => {
    const found = [];
    const shops = await ctx.db.query("shops").take(10); // dev has one shop; bounded anyway
    for (const clientId of clientIds.slice(0, 50)) {
      for (const shop of shops) {
        const row = await ctx.db
          .query("transactions")
          .withIndex("by_shop_clientId", (q) => q.eq("shopId", shop._id).eq("clientId", clientId))
          .unique();
        if (row) found.push({ clientId, photos: row.photos.length, status: row.status });
      }
    }
    return found;
  },
});
