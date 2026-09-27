import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules, seedShop } from "./test.setup";

const newParty = (clientId: string, name: string, extra: Record<string, string> = {}) => ({
  clientId,
  name,
  kind: "customer" as const,
  ...extra,
});

describe("parties.create (F-04)", () => {
  it("derives Latin form and phonetic key from a Devanagari name", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedShop(t);
    const id = await asOwner.mutation(
      api.parties.create,
      newParty("c1", " राम  बहादुर थापा ", { tag: " चोक ", phone: "  " }),
    );
    const party = await t.run((ctx) => ctx.db.get(id));
    expect(party).toMatchObject({
      displayName: "राम बहादुर थापा",
      nameLatin: "Ram Bahadur Thapa",
      nameDevanagari: "राम बहादुर थापा",
      phoneticKey: "rm bhdr tp",
      tag: "चोक",
      kind: "customer",
      isWalkIn: false,
      billCount: 0,
    });
    expect(party).not.toHaveProperty("phone"); // blank optional fields are dropped
  });

  it("stores a Latin name as typed, with phone, and no Devanagari guess", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedShop(t);
    const id = await asOwner.mutation(api.parties.create, {
      ...newParty("c1", "Everest Traders", { phone: "9800000000" }),
      kind: "supplier",
    });
    const party = await t.run((ctx) => ctx.db.get(id));
    expect(party).toMatchObject({
      nameLatin: "Everest Traders",
      kind: "supplier",
      phone: "9800000000",
    });
    expect(party).not.toHaveProperty("nameDevanagari");
  });

  it("architecture §5.3 invariant 2: the same clientId returns the same account", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedShop(t);
    const first = await asOwner.mutation(api.parties.create, newParty("same", "Sita"));
    const again = await asOwner.mutation(api.parties.create, newParty("same", "Sita (retry)"));
    expect(again).toBe(first);
    const named = await t.run((ctx) => ctx.db.query("parties").collect());
    expect(named.filter((p) => !p.isWalkIn)).toHaveLength(1);
  });

  it("F-15: writes an audit entry", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedShop(t);
    const id = await asOwner.mutation(api.parties.create, newParty("c1", "Hari"));
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit).toEqual([
      expect.objectContaining({
        action: "party.create",
        entity: "party",
        entityId: id,
        summary: "Hari (customer)",
      }),
    ]);
  });

  it("rejects blank, letterless or overlong names and bad clientIds → VALIDATION", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedShop(t);
    for (const bad of [
      newParty("c1", "   "),
      newParty("c2", "123 !!"),
      newParty("c3", "x".repeat(81)),
      newParty("", "Hari"),
      newParty("c".repeat(65), "Hari"),
    ]) {
      await expect(asOwner.mutation(api.parties.create, bad)).rejects.toThrow(/VALIDATION/);
    }
  });

  it("NFR-06: strangers cannot create", async () => {
    const t = convexTest(schema, modules);
    await seedShop(t);
    await expect(
      t
        .withIdentity({ subject: "user_stranger" })
        .mutation(api.parties.create, newParty("c1", "Hari")),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("parties.listForPicker (F-04)", () => {
  it("lists usable accounts of the caller's shop, most recent first, walk-in included", async () => {
    const t = convexTest(schema, modules);
    const { shopId, asOwner } = await seedShop(t);
    const a = await asOwner.mutation(api.parties.create, newParty("a", "Old Customer"));
    const b = await asOwner.mutation(api.parties.create, newParty("b", "Archived"));
    const c = await asOwner.mutation(api.parties.create, newParty("c", "Merged Away"));
    const d = await asOwner.mutation(api.parties.create, newParty("d", "Deleted"));
    const e = await asOwner.mutation(api.parties.create, newParty("e", "Being Deleted"));
    await t.run(async (ctx) => {
      await ctx.db.patch(a, { lastUsedAt: 1 });
      await ctx.db.patch(b, { archived: true });
      await ctx.db.patch(c, { mergedIntoId: a });
      await ctx.db.patch(d, { deletedAt: 1 }); // ADR-037
      await ctx.db.patch(e, { deletingAt: 1 });
      const creator = await ctx.db.query("members").first();
      if (!creator) throw new Error("seed created no members");
      const other = await ctx.db.insert("shops", { name: "Other", createdAt: 0 });
      await ctx.db.insert("parties", {
        shopId: other,
        clientId: "x",
        kind: "customer",
        displayName: "Other Shop's",
        nameLatin: "x",
        phoneticKey: "x",
        isWalkIn: false,
        archived: false,
        lastUsedAt: Date.now() + 1000,
        billCount: 0,
        salePaisa: 0,
        purchasePaisa: 0,
        balancePaisa: 0,
        createdBy: creator._id,
        createdAt: 0,
      });
    });
    const list = await asOwner.query(api.parties.listForPicker, {});
    expect(list.map((p) => p.displayName)).toEqual(["नगद ग्राहक", "Old Customer"]);
    expect(list[0]).toMatchObject({ isWalkIn: true, clientId: "walk-in" });
    expect(list.every((p) => !("nameLatin" in p))).toBe(true); // trimmed
    expect(shopId).toBeDefined();
  });

  it("F-04: includes the last bill line when the account has one (ADR-030)", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedShop(t);
    const withAmount = await asOwner.mutation(api.parties.create, newParty("a", "Hari"));
    const noAmount = await asOwner.mutation(api.parties.create, newParty("b", "Sita"));
    await t.run(async (ctx) => {
      await ctx.db.patch(withAmount, { lastBillDateBs: "2083-06-06", lastBillPaisa: 234_000 });
      await ctx.db.patch(noAmount, { lastBillDateBs: "2083-06-07" });
    });
    const byName = new Map(
      (await asOwner.query(api.parties.listForPicker, {})).map((p) => [p.displayName, p]),
    );
    expect(byName.get("Hari")).toMatchObject({
      lastBillDateBs: "2083-06-06",
      lastBillPaisa: 234_000,
    });
    expect(byName.get("Sita")).toMatchObject({ lastBillDateBs: "2083-06-07" });
    expect(byName.get("Sita")).not.toHaveProperty("lastBillPaisa");
    expect(byName.get("नगद ग्राहक")).not.toHaveProperty("lastBillDateBs"); // no bills yet
  });

  it("NFR-06: strangers get FORBIDDEN", async () => {
    const t = convexTest(schema, modules);
    await seedShop(t);
    await expect(
      t.withIdentity({ subject: "user_stranger" }).query(api.parties.listForPicker, {}),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("parties.similar (F-04 “उही हो?”)", () => {
  it("UC-04: finds the existing Ram Bahadur Thapa for “राम ब थापा”, never the walk-in", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedShop(t);
    await asOwner.mutation(api.parties.create, newParty("r", "Ram Bahadur Thapa", { tag: "चोक" }));
    await asOwner.mutation(api.parties.create, newParty("s", "Sita Gurung"));
    expect(await asOwner.query(api.parties.similar, { name: "राम ब थापा" })).toEqual([
      expect.objectContaining({ displayName: "Ram Bahadur Thapa", tag: "चोक" }),
    ]);
    expect(await asOwner.query(api.parties.similar, { name: "नगद" })).toEqual([]);
    expect(await asOwner.query(api.parties.similar, { name: "Sita" })).toEqual([
      { _id: expect.any(String), displayName: "Sita Gurung" },
    ]);
  });

  it("ADR-037: never suggests a deleted account", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedShop(t);
    const gone = await asOwner.mutation(api.parties.create, newParty("g", "Gopal Shrestha"));
    await t.run((ctx) => ctx.db.patch(gone, { deletedAt: 1 }));
    expect(await asOwner.query(api.parties.similar, { name: "Gopal" })).toEqual([]);
  });
});

describe("members.setLocale (F-10)", () => {
  it("saves the caller's language only", async () => {
    const t = convexTest(schema, modules);
    const { asOwner, asAdmin } = await seedShop(t);
    await asOwner.mutation(api.members.setLocale, { locale: "en" });
    expect((await asOwner.query(api.members.me, {}))?.member.locale).toBe("en");
    expect((await asAdmin.query(api.members.me, {}))?.member.locale).toBe("en"); // admin default, untouched
    await asAdmin.mutation(api.members.setLocale, { locale: "ne" });
    expect((await asOwner.query(api.members.me, {}))?.member.locale).toBe("en");
    await expect(
      t
        .withIdentity({ subject: "user_stranger" })
        .mutation(api.members.setLocale, { locale: "ne" }),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
