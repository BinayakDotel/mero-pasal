import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  adminMutation,
  adminQuery,
  memberMutation,
  memberQuery,
  ownerMutation,
} from "./lib/functions";
import schema from "./schema";
import { modules } from "./test.setup";

// Probe functions exist only in this test's module map, so nothing test-only is deployed.
const probe = { args: {}, handler: async (ctx: { shopId: Id<"shops"> }) => ctx.shopId };
const probes = {
  member: memberQuery(probe),
  memberWrite: memberMutation(probe),
  owner: ownerMutation(probe),
  admin: adminQuery(probe),
  adminWrite: adminMutation(probe),
};
const p = {
  member: makeFunctionReference<"query">("probes:member"),
  memberWrite: makeFunctionReference<"mutation">("probes:memberWrite"),
  owner: makeFunctionReference<"mutation">("probes:owner"),
  admin: makeFunctionReference<"query">("probes:admin"),
  adminWrite: makeFunctionReference<"mutation">("probes:adminWrite"),
};

const OWNER = "user_owner";
const ADMIN = "user_admin";

async function setup() {
  const t = convexTest(schema, { ...modules, "./probes.ts": async () => probes });
  const shopId = await t.mutation(internal.seed.bootstrap, {
    shopName: "Laxmi Kirana",
    shopNameNe: "लक्ष्मी किराना",
    owner: { clerkUserId: OWNER, displayName: "Buwa" },
    admin: { clerkUserId: ADMIN, displayName: "Binayak", email: "Binayak@Example.com" },
  });
  const addMember = (
    clerkUserId: string,
    {
      role = "staff",
      active = true,
      shop = shopId,
    }: Partial<{
      role: "owner" | "admin" | "staff";
      active: boolean;
      shop: Id<"shops">;
    }> = {},
  ) =>
    t.run((ctx) =>
      ctx.db.insert("members", {
        shopId: shop,
        clerkUserId,
        displayName: "Someone",
        role,
        locale: "ne",
        active,
      }),
    );
  const addStaff = (clerkUserId: string, active: boolean) => addMember(clerkUserId, { active });
  const addShop = () => t.run((ctx) => ctx.db.insert("shops", { name: "Other", createdAt: 0 }));
  return { t, shopId, addStaff, addMember, addShop };
}

const as = (t: Awaited<ReturnType<typeof setup>>["t"], subject: string) =>
  t.withIdentity({ subject });

describe("auth wrappers (architecture §6, §10)", () => {
  it("NFR-06: no identity → UNAUTHENTICATED", async () => {
    const { t } = await setup();
    await expect(t.query(p.member, {})).rejects.toThrow(/UNAUTHENTICATED/);
    await expect(t.mutation(p.memberWrite, {})).rejects.toThrow(/UNAUTHENTICATED/);
  });

  it("F-01: signed in but not invited → FORBIDDEN", async () => {
    const { t } = await setup();
    await expect(as(t, "user_stranger").query(p.member, {})).rejects.toThrow(/FORBIDDEN/);
  });

  it("F-13: a deactivated member → FORBIDDEN", async () => {
    const { t, addStaff } = await setup();
    await addStaff("user_gone", false);
    await expect(as(t, "user_gone").query(p.member, {})).rejects.toThrow(/FORBIDDEN/);
  });

  it("ADR-014: injects the caller's own shopId, never another shop's", async () => {
    const { t, shopId, addStaff, addMember, addShop } = await setup();
    await addStaff("user_staff", true);
    const otherShop = await addShop();
    await addMember("user_other", { role: "admin", shop: otherShop });
    for (const who of [OWNER, ADMIN, "user_staff"]) {
      expect(await as(t, who).query(p.member, {})).toBe(shopId);
      expect(await as(t, who).mutation(p.memberWrite, {})).toBe(shopId);
    }
    expect(await as(t, "user_other").query(p.member, {})).toBe(otherShop);
    expect(await as(t, "user_other").mutation(p.adminWrite, {})).toBe(otherShop);
  });

  it("F-13: deactivated members are refused by mutation and admin wrappers too", async () => {
    const { t, addMember } = await setup();
    await addMember("user_old_admin", { role: "admin", active: false });
    await expect(as(t, "user_old_admin").mutation(p.adminWrite, {})).rejects.toThrow(/FORBIDDEN/);
    await expect(as(t, "user_old_admin").mutation(p.memberWrite, {})).rejects.toThrow(/FORBIDDEN/);
  });

  it("a deactivated row does not shadow the same user's active row", async () => {
    const { t, shopId, addMember } = await setup();
    await addMember("user_back", { active: false });
    await addMember("user_back", { active: true });
    expect(await as(t, "user_back").query(p.member, {})).toBe(shopId);
  });

  it("two active rows for one Clerk user → CONFLICT, not a silent pick", async () => {
    const { t, addMember, addShop } = await setup();
    await addMember("user_twice");
    await addMember("user_twice", { shop: await addShop() });
    await expect(as(t, "user_twice").query(p.member, {})).rejects.toThrow(/CONFLICT/);
    await expect(as(t, "user_twice").query(api.members.me, {})).rejects.toThrow(/CONFLICT/);
  });

  it("architecture §10 role matrix: owner-or-admin writes", async () => {
    const { t, shopId, addStaff } = await setup();
    await addStaff("user_staff", true);
    expect(await as(t, OWNER).mutation(p.owner, {})).toBe(shopId);
    expect(await as(t, ADMIN).mutation(p.owner, {})).toBe(shopId);
    await expect(as(t, "user_staff").mutation(p.owner, {})).rejects.toThrow(/FORBIDDEN/);
  });

  it("architecture §10 role matrix: admin-only reads and writes", async () => {
    const { t, shopId } = await setup();
    expect(await as(t, ADMIN).query(p.admin, {})).toBe(shopId);
    expect(await as(t, ADMIN).mutation(p.adminWrite, {})).toBe(shopId);
    await expect(as(t, OWNER).query(p.admin, {})).rejects.toThrow(/FORBIDDEN/);
    await expect(as(t, OWNER).mutation(p.adminWrite, {})).rejects.toThrow(/FORBIDDEN/);
  });

  it("architecture §10 role matrix: staff cannot use admin wrappers", async () => {
    const { t, addStaff } = await setup();
    await addStaff("user_staff", true);
    await expect(as(t, "user_staff").query(p.admin, {})).rejects.toThrow(/FORBIDDEN/);
    await expect(as(t, "user_staff").mutation(p.adminWrite, {})).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("members.me (F-01)", () => {
  it("returns null when signed out", async () => {
    const { t } = await setup();
    expect(await t.query(api.members.me, {})).toBeNull();
  });

  it("returns null for a signed-in stranger (drives the Not invited screen)", async () => {
    const { t } = await setup();
    expect(await as(t, "user_stranger").query(api.members.me, {})).toBeNull();
  });

  it("returns null for a deactivated member", async () => {
    const { t, addStaff } = await setup();
    await addStaff("user_gone", false);
    expect(await as(t, "user_gone").query(api.members.me, {})).toBeNull();
  });

  it("returns the member and shop for Buwa, Nepali by default", async () => {
    const { t, shopId } = await setup();
    const me = await as(t, OWNER).query(api.members.me, {});
    expect(me).toMatchObject({
      member: { displayName: "Buwa", role: "owner", locale: "ne" },
      shop: { _id: shopId, name: "Laxmi Kirana", nameNe: "लक्ष्मी किराना" },
    });
  });

  it("omits nameNe when the shop has none", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.bootstrap, {
      shopName: "Shop",
      owner: { clerkUserId: OWNER, displayName: "Buwa" },
      admin: { clerkUserId: ADMIN, displayName: "Binayak" },
    });
    const me = await as(t, ADMIN).query(api.members.me, {});
    expect(me?.shop).not.toHaveProperty("nameNe");
    expect(me?.member).toMatchObject({ role: "admin", locale: "en" });
  });
});
