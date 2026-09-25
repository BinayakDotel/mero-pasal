import { addDaysBs, monthOf, todayBs } from "@mero-pasal/shared/dates";
import type { FunctionArgs } from "convex/server";
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
  const bill = async (extra: { partyId?: Id<"parties">; amountPaisa?: number } = {}) => {
    const clientId = crypto.randomUUID();
    const [storageId, thumbId] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["f"])),
      await ctx.storage.store(new Blob(["t"])),
    ]);
    await shop.asOwner.mutation(api.transactions.createFromClient, {
      clientId,
      kind: "sale",
      dateBs: today,
      ...(extra.partyId ? { partyRef: { id: extra.partyId } } : {}),
      ...(extra.amountPaisa === undefined ? {} : { amountPaisa: extra.amountPaisa }),
      photos: [{ storageId, thumbId, width: 1, height: 1, bytes: 1 }],
    });
    return clientId;
  };
  const stored = (clientId: string) =>
    t.run((ctx) =>
      ctx.db
        .query("transactions")
        .collect()
        .then((rows) => rows.find((r) => r.clientId === clientId)),
    );
  type Edit = Omit<FunctionArgs<typeof api.billAdmin.update>, "expectedUpdatedAt">;
  /** An admin save from a drawer opened just now (the bill's current version). */
  const edit = async (args: Edit) =>
    shop.asAdmin.mutation(api.billAdmin.update, {
      ...args,
      expectedUpdatedAt: (await stored(args.clientId))?.updatedAt ?? 0,
    });
  return { t, ...shop, today, party, bill, stored, edit };
}

describe("billAdmin.update (F-11 drawer)", () => {
  it("sets amount, bill number and note; audit says what changed; totals follow", async () => {
    const { t, asAdmin, today, bill, stored, edit } = await setup();
    const clientId = await bill();
    await edit({
      clientId,
      kind: "sale",
      dateBs: today,
      amountPaisa: 45_000,
      billNumber: " 1234 ",
      note: "read from the photo",
    });
    expect(await stored(clientId)).toMatchObject({
      amountPaisa: 45_000,
      billNumber: "1234",
      note: "read from the photo",
      needsAttention: true, // still no name (F-04 "पछि")
    });
    const summary = await asAdmin.query(api.summaries.forDate, { dateBs: today });
    expect(summary).toMatchObject({ salePaisa: 45_000, missingAmountCount: 0 });
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.find((a) => a.action === "tx.adminUpdate")?.summary).toBe(
      "amount: — → Rs 450 · bill number: — → 1234 · note changed",
    );
  });

  it("bill number and note: left out stays, '' clears (inline fixes never lose them)", async () => {
    const { today, bill, stored, edit } = await setup();
    const clientId = await bill();
    const base = { clientId, kind: "sale" as const, dateBs: today };
    await edit({ ...base, billNumber: "77", note: "keep me" });
    await edit({ ...base, amountPaisa: 500 }); // inline fix
    expect(await stored(clientId)).toMatchObject({
      amountPaisa: 500,
      billNumber: "77",
      note: "keep me",
    });
    await edit({ ...base, amountPaisa: 500, note: "" });
    const after = await stored(clientId);
    expect(after?.note).toBeUndefined();
    expect(after?.billNumber).toBe("77");
  });

  it("admin may set any past date, never a future one; unchanged is a no-op", async () => {
    const { today, bill, stored, edit } = await setup();
    const clientId = await bill({ amountPaisa: 100 });
    const old = addDaysBs(today, -200); // beyond Buwa's 90-day limit
    const base = { clientId, kind: "sale" as const, amountPaisa: 100 };
    await edit({ ...base, dateBs: old });
    expect((await stored(clientId))?.dateBs).toBe(old);
    const before = (await stored(clientId))?.updatedAt;
    await edit({ ...base, dateBs: old });
    expect((await stored(clientId))?.updatedAt).toBe(before);
    await expect(edit({ ...base, dateBs: addDaysBs(today, 5) })).rejects.toThrow(/VALIDATION/);
  });

  it("a removed bill must be restored first; owners can't use it", async () => {
    const { asOwner, today, bill, edit } = await setup();
    const clientId = await bill({ amountPaisa: 100 });
    await asOwner.mutation(api.transactions.remove, { clientId });
    await expect(edit({ clientId, kind: "sale", dateBs: today })).rejects.toThrow(/CONFLICT/);
    await expect(
      asOwner.mutation(api.billAdmin.update, {
        clientId,
        kind: "sale",
        dateBs: today,
        expectedUpdatedAt: 0,
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("a stale drawer never overwrites a newer correction (CONFLICT)", async () => {
    const { asOwner, asAdmin, today, bill, stored } = await setup();
    const clientId = await bill({ amountPaisa: 100 });
    const opened = (await stored(clientId))?.updatedAt ?? 0; // admin opens the drawer
    await new Promise((resolve) => setTimeout(resolve, 5)); // a later moment, a newer version
    await asOwner.mutation(api.transactions.correct, {
      clientId,
      kind: "sale",
      dateBs: today,
      amountPaisa: 900, // Buwa corrects it on the phone meanwhile
    });
    await expect(
      asAdmin.mutation(api.billAdmin.update, {
        clientId,
        kind: "sale",
        dateBs: today,
        amountPaisa: 100,
        note: "from the drawer",
        expectedUpdatedAt: opened,
      }),
    ).rejects.toThrow(/CONFLICT/);
    expect(await stored(clientId)).toMatchObject({ amountPaisa: 900 });
  });
});

describe("transactions.restore after a merge", () => {
  it("brings the bill back on the account it was merged into", async () => {
    const { t, asOwner, asAdmin, today, party, bill, stored } = await setup();
    const a = await party("Ram Bdr Thapa");
    const b = await party("राम बहादुर थापा");
    const clientId = await bill({ partyId: a, amountPaisa: 700 });
    await asOwner.mutation(api.transactions.remove, { clientId });
    await t.run((ctx) => ctx.db.patch(a, { mergedIntoId: b })); // merged while it was removed
    await asAdmin.mutation(api.transactions.restore, { clientId });
    expect((await stored(clientId))?.partyId).toBe(b);
    const got = await asAdmin.query(api.parties.get, { id: b, monthBs: monthOf(today) });
    expect(got.month).toMatchObject({ billCount: 1, salePaisa: 700 });
  });
});
