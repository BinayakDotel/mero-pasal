import { addDaysBs, todayBs } from "@mero-pasal/shared/dates";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, seedShop } from "./test.setup";

// M5 trial: the day's numbers Binayak compares with the paper bill book.
describe("trial.day (M5 daily numbers)", () => {
  it("counts the day's bills, what they miss, removals and who took them", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedShop(t);
    const today = todayBs(Date.now());
    const ram = await asOwner.mutation(api.parties.create, {
      clientId: "ram",
      name: "Ram",
      kind: "customer",
    });
    const bill = async (
      extra: { kind?: "sale" | "purchase"; partyId?: Id<"parties">; amountPaisa?: number },
      dateBs = today,
    ) => {
      const clientId = crypto.randomUUID();
      const [storageId, thumbId] = await t.run(async (ctx) => [
        await ctx.storage.store(new Blob(["f"])),
        await ctx.storage.store(new Blob(["t"])),
      ]);
      await asOwner.mutation(api.transactions.createFromClient, {
        clientId,
        kind: extra.kind ?? "sale",
        dateBs,
        ...(extra.partyId ? { partyRef: { id: extra.partyId } } : {}),
        ...(extra.amountPaisa === undefined ? {} : { amountPaisa: extra.amountPaisa }),
        photos: [{ storageId, thumbId, width: 1, height: 1, bytes: 1 }],
      });
      return clientId;
    };
    await bill({ partyId: ram, amountPaisa: 10_000 });
    await bill({ amountPaisa: 2_500 }); // no name
    await bill({ kind: "purchase", partyId: ram }); // no amount
    const gone = await bill({ partyId: ram, amountPaisa: 700 });
    await asOwner.mutation(api.transactions.remove, { clientId: gone });
    await bill({ partyId: ram, amountPaisa: 1 }, addDaysBs(today, -1)); // another day

    expect(await t.query(internal.trial.day, { dateBs: today })).toEqual({
      dateBs: today,
      bills: 3,
      sold: 2,
      bought: 1,
      soldPaisa: 12_500,
      boughtPaisa: 0,
      noAmount: 1,
      noName: 1,
      removed: 1,
      byMember: [{ name: "Owner", bills: 3 }],
    });
    await expect(t.query(internal.trial.day, { dateBs: "2083-13-01" })).rejects.toThrow(
      /VALIDATION/,
    );
  });
});
