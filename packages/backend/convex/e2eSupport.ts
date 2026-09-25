import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { appError } from "./lib/errors";
import { insertWalkIn, WALK_IN_CLIENT_ID } from "./seed";

// M2 e2e (plan PR 9): Playwright sets up its own shop and checks what reached the server through
// `convex run` against the DEV deployment. Internal only: not callable from any client.

/** Test bills live in their own shop, so they never touch the real shop's totals. */
export const E2E_SHOP_NAME = "E2E test shop";

/**
 * Idempotent: the E2E shop with its walk-in account and the Clerk dev test user as its admin
 * (M4: admin can do everything an owner can in the phone app, plus /admin).
 * Refuses a user who already belongs to another shop (never moves a real member).
 */
export const ensureE2eShop = internalMutation({
  args: { clerkUserId: v.string(), email: v.string() },
  returns: v.id("shops"),
  handler: async (ctx, { clerkUserId, email }) => {
    if (!email.includes("+clerk_test@")) {
      throw appError("VALIDATION", "Only Clerk test users (…+clerk_test@…) can join the E2E shop");
    }
    const now = Date.now();
    // The member first: it knows its shop, however many shops dev has.
    const existing = await ctx.db
      .query("members")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    const existingShop = existing ? await ctx.db.get(existing.shopId) : null;
    if (existing && existingShop?.name !== E2E_SHOP_NAME) {
      throw appError("CONFLICT", "This Clerk user already belongs to another shop");
    }
    const shopId =
      existing?.shopId ??
      (await ctx.db.query("shops").take(50)).find((s) => s.name === E2E_SHOP_NAME)?._id ??
      (await ctx.db.insert("shops", { name: E2E_SHOP_NAME, createdAt: now }));

    let memberId = existing?._id;
    if (existing && (!existing.active || existing.role !== "admin")) {
      await ctx.db.patch(existing._id, { active: true, role: "admin" });
    }
    memberId ??= await ctx.db.insert("members", {
      shopId,
      clerkUserId,
      displayName: "E2E",
      role: "admin",
      locale: "ne",
      active: true,
      email: email.trim().toLowerCase(),
    });

    const walkIn = await ctx.db
      .query("parties")
      .withIndex("by_shop_clientId", (q) =>
        q.eq("shopId", shopId).eq("clientId", WALK_IN_CLIENT_ID),
      )
      .unique();
    if (!walkIn) await insertWalkIn(ctx, shopId, memberId, now);
    return shopId;
  },
});

/** Which of these phone-made bills reached the E2E shop, with their photo counts. */
export const billsByClientIds = internalQuery({
  args: { clientIds: v.array(v.string()) },
  returns: v.array(v.object({ clientId: v.string(), photos: v.number(), status: v.string() })),
  handler: async (ctx, { clientIds }) => {
    const shop = (await ctx.db.query("shops").take(50)).find((s) => s.name === E2E_SHOP_NAME);
    if (!shop) return [];
    const found = [];
    for (const clientId of clientIds.slice(0, 50)) {
      const row = await ctx.db
        .query("transactions")
        .withIndex("by_shop_clientId", (q) => q.eq("shopId", shop._id).eq("clientId", clientId))
        .unique();
      if (row) found.push({ clientId, photos: row.photos.length, status: row.status });
    }
    return found;
  },
});
