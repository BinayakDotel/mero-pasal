import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { WALK_IN_CLIENT_ID, WALK_IN_PHONETIC_KEY } from "./seed";
import { modules } from "./test.setup";

const args = {
  shopName: "Laxmi Kirana",
  owner: { clerkUserId: "user_owner", displayName: "Buwa" },
  admin: { clerkUserId: "user_admin", displayName: "Binayak", email: "Binayak@Example.com" },
};

describe("seed.bootstrap (F-01)", () => {
  it("creates the shop, owner, admin and the walk-in account", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.mutation(internal.seed.bootstrap, args);

    const { members, parties } = await t.run(async (ctx) => ({
      members: await ctx.db.query("members").collect(),
      parties: await ctx.db.query("parties").collect(),
    }));

    expect(members.map((m) => [m.clerkUserId, m.role, m.locale, m.active, m.shopId])).toEqual([
      ["user_owner", "owner", "ne", true, shopId],
      ["user_admin", "admin", "en", true, shopId],
    ]);
    expect(members[1]?.email).toBe("binayak@example.com");
    expect(members[0]).not.toHaveProperty("email");

    expect(parties).toHaveLength(1);
    expect(parties[0]).toMatchObject({
      shopId,
      clientId: WALK_IN_CLIENT_ID,
      isWalkIn: true,
      kind: "customer",
      displayName: "नगद ग्राहक",
      phoneticKey: WALK_IN_PHONETIC_KEY,
      archived: false,
      billCount: 0,
      balancePaisa: 0,
      createdBy: members[1]?._id,
    });
  });

  it("runs only once → CONFLICT", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.bootstrap, args);
    await expect(t.mutation(internal.seed.bootstrap, args)).rejects.toThrow(/CONFLICT/);
  });

  it("trims inputs and normalises email", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.bootstrap, {
      ...args,
      shopName: "  Laxmi Kirana ",
      admin: { ...args.admin, email: "  Binayak@Example.com " },
    });
    const { shop, admin } = await t.run(async (ctx) => ({
      shop: await ctx.db.query("shops").first(),
      admin: await ctx.db
        .query("members")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", "user_admin"))
        .first(),
    }));
    expect(shop?.name).toBe("Laxmi Kirana");
    expect(admin?.email).toBe("binayak@example.com");
  });

  it("rejects blank required fields → VALIDATION", async () => {
    const t = convexTest(schema, modules);
    for (const bad of [
      { ...args, shopName: "  " },
      { ...args, owner: { ...args.owner, clerkUserId: "" } },
      { ...args, admin: { ...args.admin, displayName: " " } },
    ]) {
      await expect(t.mutation(internal.seed.bootstrap, bad)).rejects.toThrow(/VALIDATION/);
    }
  });

  it("rejects the same Clerk user as owner and admin → VALIDATION", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.seed.bootstrap, { ...args, admin: args.owner }),
    ).rejects.toThrow(/VALIDATION/);
  });
});
