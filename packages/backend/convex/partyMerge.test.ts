import { monthOf, todayBs } from "@mero-pasal/shared/dates";
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
  const party = (name: string, kind: "customer" | "supplier" = "customer", phone?: string) =>
    shop.asOwner.mutation(api.parties.create, {
      clientId: crypto.randomUUID(),
      name,
      kind,
      ...(phone ? { phone } : {}),
    });
  const bill = async (partyId: Id<"parties">, amountPaisa: number) => {
    const clientId = crypto.randomUUID();
    const [storageId, thumbId] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["f"])),
      await ctx.storage.store(new Blob(["t"])),
    ]);
    await shop.asOwner.mutation(api.transactions.createFromClient, {
      clientId,
      kind: "sale",
      dateBs: today,
      partyRef: { id: partyId },
      amountPaisa,
      photos: [{ storageId, thumbId, width: 1, height: 1, bytes: 1 }],
    });
    return clientId;
  };
  const finish = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const state = () =>
    t.run(async (ctx) => ({
      txs: await ctx.db.query("transactions").collect(),
      parties: await ctx.db.query("parties").collect(),
      monthly: await ctx.db.query("partyMonthly").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));
  return { t, ...shop, today, party, bill, finish, state };
}

/** Architecture §5.3 invariant 3 for accounts: totals equal a recount of their active bills. */
type State = Awaited<ReturnType<Awaited<ReturnType<typeof setup>>["state"]>>;

async function expectAccountTotalsMatchBills(s: State) {
  for (const p of s.parties) {
    const mine = s.txs.filter((x) => x.partyId === p._id && x.status === "active");
    expect(p.billCount, p.displayName).toBe(mine.length);
    expect(p.salePaisa, p.displayName).toBe(mine.reduce((sum, x) => sum + (x.amountPaisa ?? 0), 0));
    const month = s.monthly.filter((m) => m.partyId === p._id);
    expect(
      month.reduce((n, m) => n + m.billCount, 0),
      p.displayName,
    ).toBe(mine.length);
  }
}

describe("partyAdmin.merge (F-12, UC-09)", () => {
  it("UC-09: every bill moves to the kept account, nothing is deleted, totals stay right", async () => {
    const { asOwner, asAdmin, today, party, bill, finish, state } = await setup();
    const latin = await party("Ram Bdr Thapa", "customer", "9841000000");
    const deva = await party("राम बहादुर थापा", "supplier");
    await bill(latin, 100);
    const removed = await bill(latin, 200);
    await asOwner.mutation(api.transactions.remove, { clientId: removed });
    await bill(latin, 300);
    await bill(deva, 50);

    await asAdmin.mutation(api.partyAdmin.merge, { keepId: deva, mergeId: latin });
    await finish();

    const s = await state();
    expect(s.txs).toHaveLength(4); // nothing deleted
    expect(s.txs.every((x) => x.partyId === deva)).toBe(true);
    const gone = s.parties.find((p) => p._id === latin);
    const kept = s.parties.find((p) => p._id === deva);
    expect(gone).toMatchObject({ mergedIntoId: deva, billCount: 0, salePaisa: 0 });
    expect(gone?.mergingInto).toBeUndefined();
    expect(kept).toMatchObject({ kind: "both", phone: "9841000000", billCount: 3, salePaisa: 450 });
    await expectAccountTotalsMatchBills(s);
    expect(s.audit.find((a) => a.action === "party.merge")?.summary).toBe(
      "Ram Bdr Thapa → राम बहादुर थापा, 3 bills",
    );
    const month = await asAdmin.query(api.parties.get, { id: deva, monthBs: monthOf(today) });
    expect(month.month).toMatchObject({ billCount: 3, salePaisa: 450 });
  });

  it("moves in batches, and picks up a bill that arrives mid-merge", async () => {
    const { t, party, bill, finish, state } = await setup();
    const a = await party("Sita Gurung");
    const b = await party("Sita Shrestha");
    for (let i = 1; i <= 5; i++) await bill(a, i * 100);
    const admin = (await state()).audit[0]?.actorId as Id<"members">;
    await t.run((ctx) => ctx.db.patch(a, { mergingInto: b }));
    await t.mutation(internal.partyAdmin.moveBatch, {
      keepId: b,
      mergeId: a,
      actorId: admin,
      moved: 0,
      batch: 2,
    });
    await bill(a, 600); // an offline phone's bill lands mid-merge
    await finish();
    const s = await state();
    expect(s.txs.filter((x) => x.partyId === b)).toHaveLength(6);
    expect(s.parties.find((p) => p._id === a)?.mergedIntoId).toBe(b);
    expect(s.audit.find((x) => x.action === "party.merge")?.summary).toMatch(/6 bills$/);
    await expectAccountTotalsMatchBills(s);
  });

  it("after the merge, a phone's bill for the old account lands on the kept one", async () => {
    const { asAdmin, party, bill, finish, state } = await setup();
    const a = await party("Hari");
    const b = await party("हरि");
    await asAdmin.mutation(api.partyAdmin.merge, { keepId: b, mergeId: a });
    await finish();
    const late = await bill(a, 700); // sent by a phone that still knew the old account
    const tx = (await state()).txs.find((x) => x.clientId === late);
    expect(tx?.partyId).toBe(b);
  });

  it("refuses the same account, the walk-in, merged or merging accounts; admin only", async () => {
    const { t, asOwner, asAdmin, party } = await setup();
    const a = await party("A");
    const b = await party("B");
    const c = await party("C");
    const walkIn = await t.run(
      async (ctx) => (await ctx.db.query("parties").collect()).find((p) => p.isWalkIn)?._id,
    );
    if (!walkIn) throw new Error("seed has a walk-in");
    const merge = (keepId: Id<"parties">, mergeId: Id<"parties">) =>
      asAdmin.mutation(api.partyAdmin.merge, { keepId, mergeId });
    await expect(merge(a, a)).rejects.toThrow(/VALIDATION/);
    await expect(merge(a, walkIn)).rejects.toThrow(/VALIDATION/);
    await expect(merge(walkIn, a)).rejects.toThrow(/VALIDATION/);
    await merge(b, a); // running (not finished)
    await expect(merge(c, a)).rejects.toThrow(/CONFLICT/); // a is being merged
    await expect(merge(c, b)).rejects.toThrow(/CONFLICT/); // bills are moving into b
    await expect(asOwner.mutation(api.partyAdmin.merge, { keepId: c, mergeId: b })).rejects.toThrow(
      /FORBIDDEN/,
    );
  });

  it("a merge whose batch failed is visible and can be resumed", async () => {
    const { t, asAdmin, party, bill, finish, state } = await setup();
    const keep = await party("Keep");
    const gone = await party("Gone");
    await bill(gone, 300);
    await bill(gone, 400);
    // As if merge started and its scheduled batch then failed: marked, nothing scheduled.
    await t.run((ctx) => ctx.db.patch(gone, { mergingInto: keep }));
    const listed = await asAdmin.query(api.partyAdmin.list, {});
    expect(listed.find((p) => p._id === gone)?.mergingInto).toBe(keep);

    await asAdmin.mutation(api.partyAdmin.resumeMerge, { mergeId: gone });
    await finish();
    const { txs, parties } = await state();
    expect(txs.every((tx) => tx.partyId === keep)).toBe(true);
    const after = parties.find((p) => p._id === gone);
    expect(after).toMatchObject({ mergedIntoId: keep });
    expect(after?.mergingInto).toBeUndefined();
    expect(parties.find((p) => p._id === keep)).toMatchObject({ billCount: 2, salePaisa: 700 });
    const { audit } = await state();
    expect(audit.find((a) => a.action === "party.merge")?.summary).toBe(
      "Gone → Keep (resumed), 2 more bills",
    );
  });

  it("never moves bills onto a kept account that was itself merged away", async () => {
    const { t, asOwner, asAdmin, party, bill } = await setup();
    const keep = await party("Keep");
    const gone = await party("Gone");
    const other = await party("Other");
    const clientId = await bill(gone, 300);
    await asOwner.mutation(api.transactions.remove, { clientId }); // removed bills move too
    await t.run(async (ctx) => {
      await ctx.db.patch(gone, { mergingInto: keep });
      await ctx.db.patch(keep, { mergedIntoId: other });
    });
    await expect(asAdmin.mutation(api.partyAdmin.resumeMerge, { mergeId: gone })).rejects.toThrow(
      /CONFLICT/,
    );
    const actorId = await t.run(
      async (ctx) => (await ctx.db.query("members").first())?._id as Id<"members">,
    );
    await t.mutation(internal.partyAdmin.moveBatch, {
      keepId: keep,
      mergeId: gone,
      actorId,
      moved: 0,
      batch: 100,
    });
    const tx = await t.run(async (ctx) =>
      (await ctx.db.query("transactions").collect()).find((r) => r.clientId === clientId),
    );
    expect(tx?.partyId).toBe(gone); // untouched; the admin stops this merge
    await asAdmin.mutation(api.partyAdmin.stopMerge, { mergeId: gone });
  });

  it("a stuck merge can be stopped: moved bills stay moved, the account is usable again", async () => {
    const { t, asAdmin, party, bill, state } = await setup();
    const keep = await party("Keep");
    const gone = await party("Gone");
    await bill(gone, 300);
    await t.run((ctx) => ctx.db.patch(gone, { mergingInto: keep }));
    await asAdmin.mutation(api.partyAdmin.stopMerge, { mergeId: gone });
    const { parties, audit } = await state();
    const after = parties.find((p) => p._id === gone);
    expect(after?.mergingInto).toBeUndefined();
    expect(after?.mergedIntoId).toBeUndefined();
    expect(after).toMatchObject({ billCount: 1, salePaisa: 300 });
    expect(audit.some((a) => a.action === "party.mergeStop" && a.entityId === gone)).toBe(true);
    await asAdmin.mutation(api.partyAdmin.setArchived, { id: gone, archived: true }); // editable
  });

  it("resume and stop need a merge in progress; admin only", async () => {
    const { t, asOwner, asAdmin, party } = await setup();
    const keep = await party("Keep");
    const gone = await party("Gone");
    await expect(asAdmin.mutation(api.partyAdmin.resumeMerge, { mergeId: gone })).rejects.toThrow(
      /VALIDATION/,
    );
    await expect(asAdmin.mutation(api.partyAdmin.stopMerge, { mergeId: gone })).rejects.toThrow(
      /VALIDATION/,
    );
    await t.run((ctx) => ctx.db.patch(gone, { mergingInto: keep }));
    await expect(asOwner.mutation(api.partyAdmin.stopMerge, { mergeId: gone })).rejects.toThrow(
      /FORBIDDEN/,
    );
  });
});
