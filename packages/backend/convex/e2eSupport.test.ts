import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { E2E_SHOP_NAME } from "./e2eSupport";
import schema from "./schema";
import { modules, seedShop } from "./test.setup";

const tester = { clerkUserId: "user_e2e", email: "someone+clerk_test@example.com" };

describe("e2eSupport.ensureE2eShop (M2 e2e)", () => {
  it("creates its own shop, walk-in and owner once; running again changes nothing", async () => {
    const t = convexTest(schema, modules);
    const real = await t.mutation(internal.seed.bootstrap, {
      shopName: "Kavre Store",
      owner: { clerkUserId: "user_owner", displayName: "Buwa" },
      admin: { clerkUserId: "user_admin", displayName: "Binayak" },
    });
    const first = await t.mutation(internal.e2eSupport.ensureE2eShop, tester);
    const second = await t.mutation(internal.e2eSupport.ensureE2eShop, tester);
    expect(second).toBe(first);
    expect(first).not.toBe(real);

    const { shops, members, walkIns } = await t.run(async (ctx) => ({
      shops: await ctx.db.query("shops").collect(),
      members: await ctx.db.query("members").collect(),
      walkIns: (await ctx.db.query("parties").collect()).filter((p) => p.shopId === first),
    }));
    expect(shops.map((s) => s.name)).toEqual(["Kavre Store", E2E_SHOP_NAME]);
    expect(members.filter((m) => m.shopId === first)).toEqual([
      expect.objectContaining({ clerkUserId: "user_e2e", role: "owner", active: true }),
    ]);
    expect(walkIns).toEqual([expect.objectContaining({ isWalkIn: true })]);
  });

  it("only takes Clerk test users", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.e2eSupport.ensureE2eShop, { ...tester, email: "buwa@gmail.com" }),
    ).rejects.toThrow(/VALIDATION/);
  });

  it("never moves a member of another shop", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.bootstrap, {
      shopName: "Kavre Store",
      owner: { clerkUserId: "user_e2e", displayName: "Buwa" },
      admin: { clerkUserId: "user_admin", displayName: "Binayak" },
    });
    await expect(t.mutation(internal.e2eSupport.ensureE2eShop, tester)).rejects.toThrow(/CONFLICT/);
  });
});

describe("e2eSupport.ensureE2eShop, more", () => {
  it("reactivates a deactivated test member in its own shop", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.e2eSupport.ensureE2eShop, tester);
    await t.run(async (ctx) => {
      const m = await ctx.db.query("members").first();
      if (m) await ctx.db.patch(m._id, { active: false });
    });
    await t.mutation(internal.e2eSupport.ensureE2eShop, tester);
    const members = await t.run((ctx) => ctx.db.query("members").collect());
    expect(members.map((m) => m.active)).toEqual([true]);
  });
});

describe("e2eSupport.billsByClientIds", () => {
  it("reports which phone-made bills reached the E2E shop, and only that shop", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedShop(t);
    await t.mutation(internal.e2eSupport.ensureE2eShop, tester);
    const asTester = t.withIdentity({ subject: tester.clerkUserId });
    const [storageId, thumbId] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["f"])),
      await ctx.storage.store(new Blob(["t"])),
    ]);
    const photo = { storageId, thumbId, width: 1, height: 1, bytes: 1 };
    const { todayBs } = await import("@mero-pasal/shared/dates");
    const bill = (clientId: string) => ({
      clientId,
      kind: "sale" as const,
      dateBs: todayBs(Date.now()),
      photos: [photo as never],
    });
    await asTester.mutation(api.transactions.createFromClient, bill("b1"));
    await asOwner.mutation(api.transactions.createFromClient, bill("real"));
    expect(
      await t.query(internal.e2eSupport.billsByClientIds, { clientIds: ["b1", "real", "nope"] }),
    ).toEqual([{ clientId: "b1", photos: 1, status: "active" }]);
  });
});
