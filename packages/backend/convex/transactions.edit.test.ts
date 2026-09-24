import { addDaysBs, monthOf, todayBs } from "@mero-pasal/shared/dates";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, seedShop } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const shop = await seedShop(t);
  const today = todayBs(Date.now());
  const party = (name: string) =>
    shop.asOwner.mutation(api.parties.create, {
      clientId: crypto.randomUUID(),
      name,
      kind: "customer",
    });
  const bill = async (
    as: typeof shop.asOwner,
    extra: { partyId?: Id<"parties">; amountPaisa?: number; kind?: "sale" | "purchase" } = {},
  ) => {
    const clientId = crypto.randomUUID();
    const [storageId, thumbId] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["f"])),
      await ctx.storage.store(new Blob(["t"])),
    ]);
    await as.mutation(api.transactions.createFromClient, {
      clientId,
      kind: extra.kind ?? "sale",
      dateBs: today,
      ...(extra.partyId ? { partyRef: { id: extra.partyId } } : {}),
      ...(extra.amountPaisa === undefined ? {} : { amountPaisa: extra.amountPaisa }),
      photos: [{ storageId, thumbId, width: 1, height: 1, bytes: 1 }],
    });
    return clientId;
  };
  const account = (id: Id<"parties">) =>
    shop.asOwner.query(api.parties.get, { id, monthBs: monthOf(today) });
  const day = (dateBs = today) => shop.asOwner.query(api.summaries.forDate, { dateBs });
  const audits = () =>
    t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .collect()
        .then((rows) => rows.filter((r) => r.action === "tx.correct")),
    );
  return { t, ...shop, today, party, bill, account, day, audits };
}

describe("transactions.correct (F-08)", () => {
  it("UC-08: moves a bill between accounts; both totals and the audit log follow", async () => {
    const { asOwner, today, party, bill, account, day, audits } = await setup();
    const gurung = await party("Sita Gurung");
    const shrestha = await party("Sita Shrestha");
    const clientId = await bill(asOwner, { partyId: gurung, amountPaisa: 50_000 });
    const before = await day();

    await asOwner.mutation(api.transactions.correct, {
      clientId,
      kind: "sale",
      partyRef: { id: shrestha },
      dateBs: today,
      amountPaisa: 50_000,
    });
    expect((await account(gurung)).month).toEqual({ billCount: 0, salePaisa: 0, purchasePaisa: 0 });
    expect((await account(shrestha)).allTime).toEqual({
      billCount: 1,
      salePaisa: 50_000,
      purchasePaisa: 0,
    });
    expect(await day()).toEqual(before); // the day's totals don't move
    expect((await audits()).map((a) => a.summary)).toEqual([
      "account: Sita Gurung → Sita Shrestha",
    ]);
  });

  it("changes amount, type and date; the day totals follow", async () => {
    const { asOwner, today, bill, day, audits } = await setup();
    const clientId = await bill(asOwner, { amountPaisa: 10_000 });
    const yesterday = addDaysBs(today, -1);
    await asOwner.mutation(api.transactions.correct, {
      clientId,
      kind: "purchase",
      dateBs: yesterday,
      amountPaisa: 25_000,
    });
    expect(await day(today)).toMatchObject({ saleCount: 0, purchaseCount: 0 });
    expect(await day(yesterday)).toMatchObject({ purchaseCount: 1, purchasePaisa: 25_000 });
    expect((await audits())[0]?.summary).toBe(
      `type: sale → purchase · amount: Rs 100 → Rs 250 · date: ${today} → ${yesterday}`,
    );
  });

  it("a retry with the same values changes nothing (exactly once)", async () => {
    const { t, asOwner, today, bill, audits } = await setup();
    const clientId = await bill(asOwner, { amountPaisa: 100 });
    const args = { clientId, kind: "sale" as const, dateBs: today, amountPaisa: 200 };
    await asOwner.mutation(api.transactions.correct, args);
    const updated = await t.run((ctx) => ctx.db.query("transactions").first());
    await asOwner.mutation(api.transactions.correct, args);
    expect(await audits()).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.query("transactions").first()))?.updatedAt).toBe(
      updated?.updatedAt,
    );
  });

  it("clearing the amount makes the bill need attention again", async () => {
    const { asOwner, today, bill, day } = await setup();
    const clientId = await bill(asOwner, { amountPaisa: 100 });
    await asOwner.mutation(api.transactions.correct, { clientId, kind: "sale", dateBs: today });
    expect(await day()).toMatchObject({ saleCount: 1, salePaisa: 0, missingAmountCount: 1 });
  });

  it("refuses bad dates, removed bills and unknown bills", async () => {
    const { t, asOwner, today, bill } = await setup();
    const clientId = await bill(asOwner, { amountPaisa: 100 });
    const correct = (extra: Record<string, unknown>) =>
      asOwner.mutation(api.transactions.correct, {
        clientId,
        kind: "sale",
        dateBs: today,
        ...extra,
      });
    await expect(correct({ dateBs: addDaysBs(today, -91) })).rejects.toThrow(/VALIDATION/);
    await expect(correct({ dateBs: addDaysBs(today, 2) })).rejects.toThrow(/VALIDATION/);
    await expect(correct({ amountPaisa: -1 })).rejects.toThrow(/VALIDATION/);
    await expect(correct({ clientId: "never-sent" })).rejects.toThrow(/NOT_FOUND/);
    await t.run(async (ctx) => {
      const row = await ctx.db.query("transactions").first();
      if (row) await ctx.db.patch(row._id, { status: "deleted", needsAttention: false });
    });
    await expect(correct({ amountPaisa: 5 })).rejects.toThrow(/CONFLICT/);
  });

  it("staff may correct only their own bills (F-08 matrix)", async () => {
    const { t, shopId, asOwner, today, bill } = await setup();
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
    const owners = await bill(asOwner, { amountPaisa: 100 });
    const own = await bill(asStaff, { amountPaisa: 100 });
    const args = { kind: "sale" as const, dateBs: today, amountPaisa: 300 };
    await expect(
      asStaff.mutation(api.transactions.correct, { clientId: owners, ...args }),
    ).rejects.toThrow(/FORBIDDEN/);
    await asStaff.mutation(api.transactions.correct, { clientId: own, ...args });
  });
});
