import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules, seedShop } from "./test.setup";

// F-13 members (admin): invite, role, deactivate; nobody locks the shop out of /admin.
async function setup() {
  const t = convexTest(schema, modules);
  const shop = await seedShop(t);
  const ids = await t.run(async (ctx) => {
    const all = await ctx.db.query("members").collect();
    return {
      owner: all.find((m) => m.role === "owner")?._id,
      admin: all.find((m) => m.role === "admin")?._id,
    };
  });
  if (!ids.owner || !ids.admin) throw new Error("seed has an owner and an admin");
  return { t, ...shop, owner: ids.owner, admin: ids.admin };
}

describe("memberAdmin (F-13)", () => {
  it("invites by email; the list shows the invite and each phone's sync health", async () => {
    const { t, shopId, asAdmin, owner } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("memberSync", {
        shopId,
        memberId: owner,
        lastSeenAt: 5,
        lastSyncAt: 4,
        pending: 2,
        failed: 1,
        foreignPending: 0,
      }),
    );
    const id = await asAdmin.mutation(api.memberAdmin.invite, {
      email: " Aama@Example.com ",
      displayName: "Aama",
      role: "staff",
    });
    const list = await asAdmin.query(api.memberAdmin.list, {});
    expect(list.find((m) => m._id === id)).toMatchObject({
      email: "aama@example.com",
      invited: true,
      active: true,
      role: "staff",
    });
    expect(list.find((m) => m._id === owner)).toMatchObject({
      invited: false,
      lastSeenAt: 5,
      lastSyncAt: 4,
      pending: 2,
      failed: 1,
    });
  });

  it("refuses a bad email, a current member, and an email of another shop", async () => {
    const { t, asAdmin } = await setup();
    await expect(
      asAdmin.mutation(api.memberAdmin.invite, { email: "nope", displayName: "X", role: "staff" }),
    ).rejects.toThrow(/VALIDATION/);
    await asAdmin.mutation(api.memberAdmin.invite, {
      email: "a@b.co",
      displayName: "A",
      role: "staff",
    });
    await expect(
      asAdmin.mutation(api.memberAdmin.invite, {
        email: "a@b.co",
        displayName: "A",
        role: "staff",
      }),
    ).rejects.toThrow(/CONFLICT/);
    const other = await t.run((ctx) => ctx.db.insert("shops", { name: "Other", createdAt: 0 }));
    await t.run((ctx) =>
      ctx.db.insert("members", {
        shopId: other,
        email: "x@y.co",
        displayName: "X",
        role: "owner",
        locale: "ne",
        active: true,
      }),
    );
    await expect(
      asAdmin.mutation(api.memberAdmin.invite, {
        email: "x@y.co",
        displayName: "X",
        role: "staff",
      }),
    ).rejects.toThrow(/CONFLICT/);
  });

  it("re-inviting a deactivated member reactivates the same row", async () => {
    const { asAdmin } = await setup();
    const id = await asAdmin.mutation(api.memberAdmin.invite, {
      email: "a@b.co",
      displayName: "A",
      role: "staff",
    });
    await asAdmin.mutation(api.memberAdmin.setActive, { memberId: id, active: false });
    expect(
      await asAdmin.mutation(api.memberAdmin.invite, {
        email: "a@b.co",
        displayName: "A again",
        role: "owner",
      }),
    ).toBe(id);
    const row = (await asAdmin.query(api.memberAdmin.list, {})).find((m) => m._id === id);
    expect(row).toMatchObject({ active: true, role: "owner", displayName: "A again" });
  });

  it("changes roles and access with an audit entry, never your own", async () => {
    const { t, asAdmin, owner, admin } = await setup();
    await asAdmin.mutation(api.memberAdmin.setRole, { memberId: owner, role: "staff" });
    await asAdmin.mutation(api.memberAdmin.setActive, { memberId: owner, active: false });
    await asAdmin.mutation(api.memberAdmin.setActive, { memberId: owner, active: true });
    await expect(
      asAdmin.mutation(api.memberAdmin.setRole, { memberId: admin, role: "owner" }),
    ).rejects.toThrow(/VALIDATION/);
    await expect(
      asAdmin.mutation(api.memberAdmin.setActive, { memberId: admin, active: false }),
    ).rejects.toThrow(/VALIDATION/);
    const actions = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").collect()).map((a) => a.action),
    );
    expect(actions).toEqual(
      expect.arrayContaining(["member.role", "member.deactivate", "member.reactivate"]),
    );
  });

  it("another shop's member is NOT_FOUND", async () => {
    const { t, asAdmin } = await setup();
    const other = await t.run((ctx) => ctx.db.insert("shops", { name: "Other", createdAt: 0 }));
    const stranger = await t.run((ctx) =>
      ctx.db.insert("members", {
        shopId: other,
        clerkUserId: "user_x",
        displayName: "X",
        role: "owner",
        locale: "ne",
        active: true,
      }),
    );
    await expect(
      asAdmin.mutation(api.memberAdmin.setActive, { memberId: stranger, active: false }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it("won't switch someone back on while they are active in another shop", async () => {
    const { t, shopId, asAdmin } = await setup();
    const other = await t.run((ctx) => ctx.db.insert("shops", { name: "Other", createdAt: 0 }));
    const here = await t.run(async (ctx) => {
      await ctx.db.insert("members", {
        shopId: other,
        clerkUserId: "user_x",
        email: "x.work@y.co",
        displayName: "X",
        role: "staff",
        locale: "ne",
        active: true,
      });
      return ctx.db.insert("members", {
        shopId,
        clerkUserId: "user_x",
        email: "x@y.co",
        displayName: "X",
        role: "staff",
        locale: "ne",
        active: false,
      });
    });
    // Two active rows would make every request of theirs fail (getMemberOrNull → CONFLICT).
    await expect(
      asAdmin.mutation(api.memberAdmin.setActive, { memberId: here, active: true }),
    ).rejects.toThrow(/CONFLICT/);
    await expect(
      asAdmin.mutation(api.memberAdmin.invite, {
        email: "x@y.co",
        displayName: "X",
        role: "staff",
      }),
    ).rejects.toThrow(/CONFLICT/);
  });

  it("won't reopen an invite whose email is active in another shop", async () => {
    const { t, asAdmin } = await setup();
    const id = await asAdmin.mutation(api.memberAdmin.invite, {
      email: "e@x.co",
      displayName: "E",
      role: "staff",
    });
    await asAdmin.mutation(api.memberAdmin.setActive, { memberId: id, active: false });
    const other = await t.run((ctx) => ctx.db.insert("shops", { name: "Other", createdAt: 0 }));
    await t.run((ctx) =>
      ctx.db.insert("members", {
        shopId: other,
        email: "e@x.co",
        displayName: "E",
        role: "staff",
        locale: "ne",
        active: true, // shop B invited them meanwhile
      }),
    );
    // Two open invites for one email would make claimInvite fail (CONFLICT) for good.
    await expect(
      asAdmin.mutation(api.memberAdmin.setActive, { memberId: id, active: true }),
    ).rejects.toThrow(/CONFLICT/);
  });

  it("owners and staff can't manage members (FORBIDDEN)", async () => {
    const { asOwner } = await setup();
    await expect(asOwner.query(api.memberAdmin.list, {})).rejects.toThrow(/FORBIDDEN/);
  });
});
