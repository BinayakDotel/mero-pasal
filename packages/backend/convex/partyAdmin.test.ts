import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules, seedShop } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const shop = await seedShop(t);
  const ram = await shop.asOwner.mutation(api.parties.create, {
    clientId: "ram",
    name: "Ram Bdr Thapa",
    kind: "customer",
    phone: "9841",
  });
  const walkIn = await t.run(
    async (ctx) => (await ctx.db.query("parties").collect()).find((p) => p.isWalkIn)?._id,
  );
  if (!walkIn) throw new Error("seed has a walk-in account");
  const get = (id: typeof ram) => t.run((ctx) => ctx.db.get(id));
  return { t, ...shop, ram, walkIn, get };
}

describe("partyAdmin.update / setArchived (F-12)", () => {
  it("renaming recomputes the name forms, so search keeps working; audit says so", async () => {
    const { t, asOwner, ram, get } = await setup();
    await asOwner.mutation(api.partyAdmin.update, {
      id: ram,
      name: "राम बहादुर थापा",
      kind: "customer",
      tag: " chowk ",
      phone: "",
    });
    const party = await get(ram);
    expect(party).toMatchObject({
      displayName: "राम बहादुर थापा",
      nameDevanagari: "राम बहादुर थापा",
      tag: "chowk",
    });
    expect(party?.phone).toBeUndefined();
    expect(party?.nameLatin).toMatch(/Ram/);
    const picker = await asOwner.query(api.parties.listForPicker, {});
    expect(picker.find((p) => p._id === ram)?.phoneticKey).toBe(party?.phoneticKey);
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit[audit.length - 1]?.summary).toBe("renamed: Ram Bdr Thapa → राम बहादुर थापा");
  });

  it("archive hides the account from the picker; unarchive brings it back", async () => {
    const { asOwner, ram } = await setup();
    await asOwner.mutation(api.partyAdmin.setArchived, { id: ram, archived: true });
    expect((await asOwner.query(api.parties.listForPicker, {})).some((p) => p._id === ram)).toBe(
      false,
    );
    await asOwner.mutation(api.partyAdmin.setArchived, { id: ram, archived: false });
    expect((await asOwner.query(api.parties.listForPicker, {})).some((p) => p._id === ram)).toBe(
      true,
    );
  });

  it("the walk-in and merged accounts can't be changed; empty name is refused", async () => {
    const { t, asOwner, ram, walkIn } = await setup();
    await expect(
      asOwner.mutation(api.partyAdmin.setArchived, { id: walkIn, archived: true }),
    ).rejects.toThrow(/VALIDATION/);
    await expect(
      asOwner.mutation(api.partyAdmin.update, { id: ram, name: "  ", kind: "customer" }),
    ).rejects.toThrow(/VALIDATION/);
    await t.run((ctx) => ctx.db.patch(ram, { mergedIntoId: walkIn }));
    await expect(
      asOwner.mutation(api.partyAdmin.update, { id: ram, name: "X", kind: "customer" }),
    ).rejects.toThrow(/CONFLICT/);
  });

  it("staff can't edit accounts; the full list (incl. archived) is admin only", async () => {
    const { t, shopId, asOwner, asAdmin, ram } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("members", {
        shopId,
        clerkUserId: "user_staff",
        displayName: "Aama",
        role: "staff",
        locale: "ne",
        active: true,
      }),
    );
    await expect(
      t
        .withIdentity({ subject: "user_staff" })
        .mutation(api.partyAdmin.update, { id: ram, name: "X", kind: "customer" }),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(asOwner.query(api.partyAdmin.list, {})).rejects.toThrow(/FORBIDDEN/);
    await asOwner.mutation(api.partyAdmin.setArchived, { id: ram, archived: true });
    expect((await asAdmin.query(api.partyAdmin.list, {})).find((p) => p._id === ram)).toMatchObject(
      { archived: true, phoneticKey: expect.any(String), lastUsedAt: expect.any(Number) },
    );
  });
});

describe("partyAdmin.duplicates (UC-09)", () => {
  it("pairs the same name across scripts or the same phone; keeps the busier account", async () => {
    const { asOwner, asAdmin, ram } = await setup();
    const deva = await asOwner.mutation(api.parties.create, {
      clientId: "deva",
      name: "राम बहादुर थापा",
      kind: "customer",
    });
    await asOwner.mutation(api.parties.create, {
      clientId: "hari",
      name: "Hari",
      kind: "customer",
      phone: "+977-9841",
    });
    await asOwner.mutation(api.parties.create, {
      clientId: "gita",
      name: "Gita",
      kind: "customer",
    });
    const pairs = await asAdmin.query(api.partyAdmin.duplicates, {});
    const names = pairs.map((p) => [p.reason, [p.keepName, p.mergeName].sort().join(" + ")]);
    expect(names).toContainEqual(["name", ["Ram Bdr Thapa", "राम बहादुर थापा"].sort().join(" + ")]);
    expect(pairs.some((p) => [p.keepId, p.mergeId].includes(ram))).toBe(true);
    expect(pairs.some((p) => [p.keepId, p.mergeId].includes(deva))).toBe(true);
    expect(pairs.every((p) => p.keepName !== "Gita" && p.mergeName !== "Gita")).toBe(true);
  });

  it("matches phones by their digits; leaves out archived accounts", async () => {
    const { t, asOwner, asAdmin } = await setup();
    const hari = await asOwner.mutation(api.parties.create, {
      clientId: "hari",
      name: "Hari Prasad",
      kind: "customer",
      phone: "+977 984-1000000",
    });
    const hp = await asOwner.mutation(api.parties.create, {
      clientId: "hp",
      name: "HP",
      kind: "customer",
      phone: "9841000000",
    });
    const pairs = await asAdmin.query(api.partyAdmin.duplicates, {});
    expect(pairs).toContainEqual(
      expect.objectContaining({ reason: "phone", keepId: expect.anything() }),
    );
    expect(
      pairs.some(
        (p) => new Set([p.keepId, p.mergeId]).has(hari) && new Set([p.keepId, p.mergeId]).has(hp),
      ),
    ).toBe(true);
    await t.run((ctx) => ctx.db.patch(hp, { archived: true }));
    expect(
      (await asAdmin.query(api.partyAdmin.duplicates, {})).some((p) =>
        [p.keepId, p.mergeId].includes(hp),
      ),
    ).toBe(false);
  });
});
