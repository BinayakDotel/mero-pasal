import { addDaysBs, monthOf, todayBs } from "@mero-pasal/shared/dates";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, seedShop } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const shop = await seedShop(t);
  const today = todayBs(Date.now());
  const party = (name: string, extra: { phone?: string; tag?: string } = {}) =>
    shop.asOwner.mutation(api.parties.create, {
      clientId: crypto.randomUUID(),
      name,
      kind: "customer",
      ...extra,
    });
  const bill = async (partyId: Id<"parties">, amountPaisa: number, dateBs = today) => {
    const [storageId, thumbId] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["f"])),
      await ctx.storage.store(new Blob(["t"])),
    ]);
    return shop.asOwner.mutation(api.transactions.createFromClient, {
      clientId: crypto.randomUUID(),
      kind: "sale",
      partyRef: { id: partyId },
      dateBs,
      amountPaisa,
      photos: [{ storageId, thumbId, width: 1, height: 1, bytes: 1 }],
    });
  };
  return { t, ...shop, today, party, bill };
}

// A date in an earlier BS month (BS months are at most 32 days, so 40 days back always is).
const earlierMonthOf = (today: string) => addDaysBs(today, -40);

describe("parties.get (F-07 account page)", () => {
  it("returns the account with all-time and this month's totals", async () => {
    const { asOwner, today, party, bill } = await setup();
    const hari = await party("Hari Prasad", { phone: "9841000000", tag: "chowk" });
    await bill(hari, 100);
    await bill(hari, 200);
    await bill(hari, 400, earlierMonthOf(today));

    const got = await asOwner.query(api.parties.get, { id: hari, monthBs: monthOf(today) });
    expect(got).toMatchObject({
      displayName: "Hari Prasad",
      phone: "9841000000",
      tag: "chowk",
      allTime: { billCount: 3, salePaisa: 700, purchasePaisa: 0 },
      month: { billCount: 2, salePaisa: 300, purchasePaisa: 0 },
    });
  });

  it("the profile: both scripts, kind, first and last bill, who may edit (F-07)", async () => {
    const { t, shopId, asOwner, today, party, bill } = await setup();
    const hari = await party("हरि प्रसाद", { phone: "9841000000" }); // typed in Devanagari
    const first = earlierMonthOf(today);
    await bill(hari, 400, first);
    await bill(hari, 100);
    const got = await asOwner.query(api.parties.get, { id: hari, monthBs: monthOf(today) });
    expect(got).toMatchObject({
      kind: "customer",
      displayName: "हरि प्रसाद",
      nameDevanagari: "हरि प्रसाद",
      nameLatin: expect.stringMatching(/^har/i), // the other script, worked out
      archived: false,
      firstBillDateBs: first,
      lastBillDateBs: today,
      createdAt: expect.any(Number),
      canEdit: true,
    });
    // Staff view the same page without the edit button; the walk-in is never editable.
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
    const asStaff = t.withIdentity({ subject: "user_staff" });
    expect(
      (await asStaff.query(api.parties.get, { id: hari, monthBs: monthOf(today) })).canEdit,
    ).toBe(false);
    const walkIn = await t.run(
      async (ctx) => (await ctx.db.query("parties").collect()).find((p) => p.isWalkIn)?._id,
    );
    if (!walkIn) throw new Error("seed has a walk-in");
    const w = await asOwner.query(api.parties.get, { id: walkIn, monthBs: monthOf(today) });
    expect(w.canEdit).toBe(false);
    expect(w.firstBillDateBs).toBeUndefined();
  });

  it("an account with no bills this month shows zeros; bad month → VALIDATION", async () => {
    const { asOwner, today, party } = await setup();
    const sita = await party("Sita");
    expect(
      (await asOwner.query(api.parties.get, { id: sita, monthBs: monthOf(today) })).month,
    ).toEqual({ billCount: 0, salePaisa: 0, purchasePaisa: 0 });
    await expect(asOwner.query(api.parties.get, { id: sita, monthBs: "2083-13" })).rejects.toThrow(
      /VALIDATION/,
    );
  });

  it("another shop's account is NOT_FOUND (ADR-014)", async () => {
    const { t, party } = await setup();
    const hari = await party("Hari");
    await t.mutation(internal.e2eSupport.ensureE2eShop, {
      clerkUserId: "user_other",
      email: "other+clerk_test@example.com",
    });
    await expect(
      t
        .withIdentity({ subject: "user_other" })
        .query(api.parties.get, { id: hari, monthBs: "2083-01" }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("parties.monthTotals (F-07 accounts list)", () => {
  it("lists each account's totals for the month", async () => {
    const { asOwner, today, party, bill } = await setup();
    const hari = await party("Hari");
    const sita = await party("Sita");
    await bill(hari, 100);
    await bill(hari, 50);
    await bill(sita, 400, earlierMonthOf(today));
    const rows = await asOwner.query(api.parties.monthTotals, { monthBs: monthOf(today) });
    expect(rows).toEqual([{ partyId: hari, billCount: 2, salePaisa: 150, purchasePaisa: 0 }]);
  });
});

describe("transactions.listByParty (F-07)", () => {
  it("pages one account's active bills, newest first, optionally one month", async () => {
    const { t, asOwner, today, party, bill } = await setup();
    const hari = await party("Hari");
    const sita = await party("Sita");
    await bill(hari, 100, earlierMonthOf(today));
    await bill(hari, 200);
    const removed = await bill(hari, 999);
    await t.run((ctx) => ctx.db.patch(removed, { status: "deleted" }));
    await bill(sita, 300);

    const all = await asOwner.query(api.transactions.listByParty, {
      partyId: hari,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(all.page.map((b) => b.amountPaisa)).toEqual([200, 100]);
    const month = await asOwner.query(api.transactions.listByParty, {
      partyId: hari,
      monthBs: monthOf(today),
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(month.page.map((b) => b.amountPaisa)).toEqual([200]);
  });
});

describe("transactions.listForParties (F-06 search)", () => {
  it("merges the matched accounts' bills, newest first, only this shop's", async () => {
    const { t, asOwner, today, party, bill } = await setup();
    const hari = await party("Hari");
    const harka = await party("Harka");
    const sita = await party("Sita");
    await bill(hari, 100, earlierMonthOf(today));
    await bill(harka, 200);
    await bill(sita, 300);
    const rows = await asOwner.query(api.transactions.listForParties, {
      partyIds: [hari, harka],
    });
    expect(rows.map((r) => r.amountPaisa)).toEqual([200, 100]);

    await t.mutation(internal.e2eSupport.ensureE2eShop, {
      clerkUserId: "user_other",
      email: "other+clerk_test@example.com",
    });
    expect(
      await t
        .withIdentity({ subject: "user_other" })
        .query(api.transactions.listForParties, { partyIds: [hari] }),
    ).toEqual([]);
  });

  it("refuses more than 5 accounts → VALIDATION", async () => {
    const { asOwner, party } = await setup();
    const ids = await Promise.all(["a", "b", "c", "d", "e", "f"].map((n) => party(n)));
    await expect(asOwner.query(api.transactions.listForParties, { partyIds: ids })).rejects.toThrow(
      /VALIDATION/,
    );
  });
});
