import { addDaysBs, todayBs } from "@mero-pasal/shared/dates";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, seedShop } from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const shop = await seedShop(t);
  const today = todayBs(Date.now());
  const ram = await shop.asOwner.mutation(api.parties.create, {
    clientId: "ram",
    name: "Ram",
    kind: "customer",
  });
  const bill = async (partyId: Id<"parties"> | undefined, amountPaisa: number, dateBs = today) => {
    const [storageId, thumbId] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["f"])),
      await ctx.storage.store(new Blob(["t"])),
    ]);
    await shop.asOwner.mutation(api.transactions.createFromClient, {
      clientId: crypto.randomUUID(),
      kind: "sale",
      dateBs,
      ...(partyId ? { partyRef: { id: partyId } } : {}),
      amountPaisa,
      photos: [{ storageId, thumbId, width: 1, height: 1, bytes: 1 }],
    });
  };
  const snapshot = () =>
    t.run(async (ctx) => ({
      daily: (await ctx.db.query("dailySummaries").collect()).map(
        ({ _id, _creationTime, ...d }) => d,
      ),
      monthly: (await ctx.db.query("partyMonthly").collect()).map(
        ({ _id, _creationTime, ...m }) => m,
      ),
      party: await ctx.db.get(ram),
    }));
  const finish = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  return { t, ...shop, today, ram, bill, snapshot, finish };
}

describe("rebuild.summaries (NFR-10 repair tool)", () => {
  it("puts drifted totals back to what the bills say, and changes nothing when they're right", async () => {
    const { t, today, ram, bill, snapshot, finish } = await setup();
    await bill(ram, 100);
    await bill(ram, 250);
    await bill(undefined, 40);
    const good = await snapshot();

    await t.run(async (ctx) => {
      const day = await ctx.db.query("dailySummaries").first();
      if (day) await ctx.db.patch(day._id, { saleCount: 99, salePaisa: 1 });
      const month = await ctx.db.query("partyMonthly").first();
      if (month) await ctx.db.delete(month._id);
      await ctx.db.patch(ram, { billCount: 7, salePaisa: 0 });
    });

    const range = { fromBs: addDaysBs(today, -2), toBs: today };
    await t.mutation(internal.rebuild.summaries, range);
    await finish(); // account totals are rebuilt page by page in the background
    expect(await snapshot()).toEqual(good);
    await t.mutation(internal.rebuild.summaries, range);
    await finish();
    expect(await snapshot()).toEqual(good);
  });

  it("leaves days outside the range alone; refuses bad or long ranges", async () => {
    const { t, today, ram, bill, snapshot } = await setup();
    await bill(ram, 100, addDaysBs(today, -20));
    await bill(ram, 100);
    await t.run(async (ctx) => {
      const old = (await ctx.db.query("dailySummaries").collect()).find(
        (d) => d.dateBs === addDaysBs(today, -20),
      );
      if (old) await ctx.db.patch(old._id, { saleCount: 5 }); // drift outside the range
    });
    await t.mutation(internal.rebuild.summaries, { fromBs: today, toBs: today });
    const oldDay = (await snapshot()).daily.find((d) => d.dateBs === addDaysBs(today, -20));
    expect(oldDay?.saleCount).toBe(5);
    await expect(
      t.mutation(internal.rebuild.summaries, { fromBs: today, toBs: addDaysBs(today, -1) }),
    ).rejects.toThrow(/VALIDATION/);
    await expect(
      t.mutation(internal.rebuild.summaries, { fromBs: addDaysBs(today, -90), toBs: today }),
    ).rejects.toThrow(/VALIDATION/);
  });

  it("rebuilds every account's totals a page at a time", async () => {
    const { t, asOwner, ram, bill, finish } = await setup();
    const sita = await asOwner.mutation(api.parties.create, {
      clientId: "sita",
      name: "Sita",
      kind: "customer",
    });
    await bill(ram, 100);
    await bill(sita, 200);
    await t.run(async (ctx) => {
      for (const id of [ram, sita]) await ctx.db.patch(id, { billCount: 9, salePaisa: 9 });
    });
    const { shopId } = await t.run(async (ctx) => ({ shopId: (await ctx.db.get(ram))?.shopId }));
    if (!shopId) throw new Error("ram has a shop");
    await t.mutation(internal.rebuild.partyTotals, { shopId, cursor: null, pageSize: 1 });
    await finish();
    const [r, s] = await t.run((ctx) => Promise.all([ctx.db.get(ram), ctx.db.get(sita)]));
    expect(r).toMatchObject({ billCount: 1, salePaisa: 100 });
    expect(s).toMatchObject({ billCount: 1, salePaisa: 200 });
  });

  it("drifted totals stop a merge; rebuild, then resume, finishes it (runbook)", async () => {
    const { t, asOwner, asAdmin, today, ram, bill, finish } = await setup();
    const keep = await asOwner.mutation(api.parties.create, {
      clientId: "keep",
      name: "Ram Bahadur",
      kind: "customer",
    });
    await bill(ram, 100);
    await bill(ram, 250);
    await t.run((ctx) => ctx.db.patch(ram, { billCount: 0, salePaisa: 0 })); // drift
    await asAdmin.mutation(api.partyAdmin.merge, { keepId: keep, mergeId: ram });
    await finish(); // the batch fails: moving a bill off would make ram's totals negative
    expect((await t.run((ctx) => ctx.db.get(ram)))?.mergingInto).toBe(keep);

    await t.mutation(internal.rebuild.summaries, { fromBs: today, toBs: today });
    await finish();
    await asAdmin.mutation(api.partyAdmin.resumeMerge, { mergeId: ram });
    await finish();
    const [gone, kept] = await t.run((ctx) => Promise.all([ctx.db.get(ram), ctx.db.get(keep)]));
    expect(gone).toMatchObject({ mergedIntoId: keep, billCount: 0, salePaisa: 0 });
    expect(kept).toMatchObject({ billCount: 2, salePaisa: 350 });
  });
});
