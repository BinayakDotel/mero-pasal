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
      expect.objectContaining({ clerkUserId: "user_e2e", role: "admin", active: true }),
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

describe("e2eSupport.resetE2eInvite (M4 invite e2e)", () => {
  it("clears a test invitee from the E2E shop only, so each run invites afresh", async () => {
    const t = convexTest(schema, modules);
    const e2e = await t.mutation(internal.e2eSupport.ensureE2eShop, {
      clerkUserId: "user_e2e",
      email: "e2e+clerk_test@example.com",
    });
    const email = "invitee+clerk_test@example.com";
    const other = await t.run((ctx) => ctx.db.insert("shops", { name: "Real", createdAt: 0 }));
    await t.run(async (ctx) => {
      for (const shopId of [e2e, other]) {
        const id = await ctx.db.insert("members", {
          shopId,
          clerkUserId: `user_${shopId}`,
          email,
          displayName: "Invitee",
          role: "staff",
          locale: "ne",
          active: shopId === e2e,
        });
        await ctx.db.insert("memberSync", {
          shopId,
          memberId: id,
          lastSeenAt: 1,
          pending: 0,
          failed: 0,
          foreignPending: 0,
        });
      }
    });
    expect(await t.mutation(internal.e2eSupport.resetE2eInvite, { email })).toBe(1);
    const left = await t.run(async (ctx) => ({
      members: (await ctx.db.query("members").collect()).filter((m) => m.email === email),
      sync: await ctx.db.query("memberSync").collect(),
    }));
    expect(left.members.map((m) => m.shopId)).toEqual([other]);
    expect(left.sync.map((s) => s.shopId)).toEqual([other]);
    await expect(
      t.mutation(internal.e2eSupport.resetE2eInvite, { email: "aama@example.com" }),
    ).rejects.toThrow(/VALIDATION/);
  });
});

describe("e2eSupport.seedUc09 (M4 UC-09 e2e)", () => {
  it("seeds a duplicate pair and two needs-attention bills through the ledger", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.e2eSupport.ensureE2eShop, tester);
    const shopId = await t.run(async (ctx) => (await ctx.db.query("shops").first())?._id);
    if (!shopId) throw new Error("E2E shop");
    // An earlier bill of the shop whose photo files the seed reuses.
    await t.run(async (ctx) => {
      const photo = {
        storageId: await ctx.storage.store(new Blob(["f"])),
        thumbId: await ctx.storage.store(new Blob(["t"])),
        width: 1,
        height: 1,
        bytes: 1,
      };
      const member = await ctx.db.query("members").first();
      if (!member) throw new Error("member");
      await ctx.db.insert("transactions", {
        shopId,
        clientId: "old",
        kind: "sale",
        dateBs: "2083-01-01",
        dateAd: 0,
        photos: [photo],
        status: "active",
        needsAttention: true,
        capturedAt: 0,
        createdBy: member._id,
        updatedAt: 0,
      });
    });
    const seeded = await t.mutation(internal.e2eSupport.seedUc09, {
      token: "abc",
      phone: "9800012345",
      noNamePaisa: 712_300,
    });
    const state = await t.query(internal.e2eSupport.partyBills, {
      ids: [seeded.keepId, seeded.mergeId],
    });
    expect(state).toEqual([
      { id: seeded.keepId, bills: 21, billCount: 21, mergedIntoId: null },
      { id: seeded.mergeId, bills: 17, billCount: 17, mergedIntoId: null },
    ]);
    const noName = await t.run(async (ctx) =>
      (await ctx.db.query("transactions").collect()).filter(
        (r) => r.amountPaisa === 712_300 && r.partyId === undefined,
      ),
    );
    expect(noName).toHaveLength(1);
    await expect(
      t.mutation(internal.e2eSupport.seedUc09, { token: "a b", phone: "1", noNamePaisa: 1 }),
    ).rejects.toThrow(/VALIDATION/);
    const fixture = await t.mutation(internal.e2eSupport.seedAdminFixture, { token: "xyz" });
    expect(fixture.partyName).toBe("Admin xyz");
    expect(await t.query(internal.e2eSupport.partyBills, { ids: [fixture.partyId] })).toEqual([
      { id: fixture.partyId, bills: 1, billCount: 1, mergedIntoId: null },
    ]);
    const big = await t.mutation(internal.e2eSupport.seedAdminFixture, { token: "big", bills: 12 });
    expect(await t.query(internal.e2eSupport.partyBills, { ids: [big.partyId] })).toEqual([
      { id: big.partyId, bills: 12, billCount: 12, mergedIntoId: null },
    ]);
    await expect(
      t.mutation(internal.e2eSupport.seedAdminFixture, { token: "bad", bills: 21 }),
    ).rejects.toThrow(/VALIDATION/);
  });
});
