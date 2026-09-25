import { addDaysBs, todayBs } from "@mero-pasal/shared/dates";
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
  const ram = await shop.asOwner.mutation(api.parties.create, {
    clientId: "ram",
    name: "Ram",
    kind: "customer",
  });
  const bill = async (
    extra: {
      kind?: "sale" | "purchase";
      dateBs?: string;
      partyId?: Id<"parties">;
      amountPaisa?: number;
    } = {},
  ) => {
    const clientId = crypto.randomUUID();
    const [storageId, thumbId] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["f"])),
      await ctx.storage.store(new Blob(["t"])),
    ]);
    await shop.asOwner.mutation(api.transactions.createFromClient, {
      clientId,
      kind: extra.kind ?? "sale",
      dateBs: extra.dateBs ?? today,
      ...(extra.partyId ? { partyRef: { id: extra.partyId } } : {}),
      ...(extra.amountPaisa === undefined ? {} : { amountPaisa: extra.amountPaisa }),
      photos: [{ storageId, thumbId, width: 1, height: 1, bytes: 1 }],
    });
    return clientId;
  };
  const list = (args: Record<string, unknown>) =>
    shop.asAdmin.query(api.billQueries.listForAdmin, {
      filter: "all",
      paginationOpts: { numItems: 20, cursor: null },
      ...args,
    });
  return { t, ...shop, today, ram, bill, list };
}

describe("billQueries.listForAdmin (F-11)", () => {
  it("needs attention = no amount or no name, with the reason flagged", async () => {
    const { ram, bill, list } = await setup();
    await bill({ partyId: ram, amountPaisa: 100 }); // fine
    const noAmount = await bill({ partyId: ram });
    const noName = await bill({ amountPaisa: 100 });
    const { page } = await list({ filter: "attention" });
    expect(new Set(page.map((r) => r.clientId))).toEqual(new Set([noAmount, noName]));
    expect(page.find((r) => r.clientId === noAmount)).toMatchObject({
      noAmount: true,
      noName: false,
    });
    expect(page.find((r) => r.clientId === noName)).toMatchObject({
      noAmount: false,
      noName: true,
    });
    expect(page[0]).toMatchObject({
      status: "active",
      pages: 1,
      capturedByName: "Owner",
      updatedAt: expect.any(Number),
    });
  });

  it("removed bills are listed for restore; type and date range filter", async () => {
    const { asOwner, today, bill, list } = await setup();
    const gone = await bill({ amountPaisa: 5 });
    await asOwner.mutation(api.transactions.remove, { clientId: gone });
    await bill({ kind: "purchase", amountPaisa: 7 });
    await bill({ kind: "sale", amountPaisa: 9, dateBs: addDaysBs(today, -10) });
    expect((await list({ filter: "removed" })).page.map((r) => r.clientId)).toEqual([gone]);
    expect((await list({ filter: "purchase" })).page.map((r) => r.amountPaisa)).toEqual([7]);
    const lastWeek = await list({ fromBs: addDaysBs(today, -12), toBs: addDaysBs(today, -8) });
    expect(lastWeek.page.map((r) => r.amountPaisa)).toEqual([9]);
  });

  it("one account's bills, removed ones only when asked", async () => {
    const { asOwner, ram, bill, list } = await setup();
    await bill({ partyId: ram, amountPaisa: 1 });
    const gone = await bill({ partyId: ram, amountPaisa: 2 });
    await asOwner.mutation(api.transactions.remove, { clientId: gone });
    await bill({ amountPaisa: 3 });
    expect((await list({ partyId: ram })).page.map((r) => r.amountPaisa)).toEqual([1]);
    expect(
      (await list({ partyId: ram, filter: "removed" })).page.map((r) => r.amountPaisa),
    ).toEqual([2]);
  });

  it("admin only", async () => {
    const { asOwner } = await setup();
    await expect(
      asOwner.query(api.billQueries.listForAdmin, {
        filter: "all",
        paginationOpts: { numItems: 5, cursor: null },
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("summaries.forRange (F-11 overview)", () => {
  it("adds up the days in the range; refuses a bad or too long range", async () => {
    const { asAdmin, today, bill } = await setup();
    await bill({ amountPaisa: 100 });
    await bill({ amountPaisa: 200, dateBs: addDaysBs(today, -3) });
    await bill({ amountPaisa: 400, dateBs: addDaysBs(today, -40) });
    const range = await asAdmin.query(api.summaries.forRange, {
      fromBs: addDaysBs(today, -5),
      toBs: today,
    });
    expect(range).toMatchObject({ saleCount: 2, salePaisa: 300, missingAmountCount: 0 });
    await expect(
      asAdmin.query(api.summaries.forRange, { fromBs: today, toBs: addDaysBs(today, -1) }),
    ).rejects.toThrow(/VALIDATION/);
    await expect(
      asAdmin.query(api.summaries.forRange, { fromBs: addDaysBs(today, -90), toBs: today }),
    ).rejects.toThrow(/VALIDATION/);
  });
});
