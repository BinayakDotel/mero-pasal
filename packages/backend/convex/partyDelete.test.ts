import { todayBs } from "@mero-pasal/shared/dates";
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
  const party = (name: string) =>
    shop.asOwner.mutation(api.parties.create, {
      clientId: crypto.randomUUID(),
      name,
      kind: "customer",
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
      daily: await ctx.db.query("dailySummaries").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));
  const account = async (id: Id<"parties">) => {
    const p = (await state()).parties.find((x) => x._id === id);
    if (!p) throw new Error("no account");
    return p;
  };
  const deleteAccount = (id: Id<"parties">) =>
    shop.asAdmin.mutation(api.partyAdmin.deleteAccount, { id });
  const restoreAccount = (id: Id<"parties">) =>
    shop.asAdmin.mutation(api.partyAdmin.restoreAccount, { id });
  return {
    t,
    ...shop,
    today,
    party,
    bill,
    finish,
    state,
    account,
    deleteAccount,
    restoreAccount,
  };
}

type State = Awaited<ReturnType<Awaited<ReturnType<typeof setup>>["state"]>>;

/** Architecture §5.3 invariant 3: every total equals a recount of the active bills. */
function expectTotalsMatchBills(s: State) {
  const active = s.txs.filter((x) => x.status === "active");
  for (const p of s.parties) {
    const mine = active.filter((x) => x.partyId === p._id);
    expect(p.billCount, p.displayName).toBe(mine.length);
    expect(p.salePaisa, p.displayName).toBe(mine.reduce((n, x) => n + (x.amountPaisa ?? 0), 0));
    const months = s.monthly.filter((m) => m.partyId === p._id);
    expect(
      months.reduce((n, m) => n + m.billCount, 0),
      p.displayName,
    ).toBe(mine.length);
  }
  expect(s.daily.reduce((n, d) => n + d.saleCount, 0)).toBe(active.length);
  expect(s.daily.reduce((n, d) => n + d.salePaisa, 0)).toBe(
    active.reduce((n, x) => n + (x.amountPaisa ?? 0), 0),
  );
}

describe("partyAdmin.deleteAccount / restoreAccount (F-12, ADR-037)", () => {
  it("removes every active bill with the account, and bringing it back restores exactly those", async () => {
    const s = await setup();
    const ram = await s.party("Ram");
    const sita = await s.party("Sita");
    await s.bill(ram, 100);
    await s.bill(ram, 200);
    const byHand = await s.bill(ram, 50);
    await s.asOwner.mutation(api.transactions.remove, { clientId: byHand });
    await s.bill(sita, 70);

    await s.deleteAccount(ram);
    expect((await s.account(ram)).deletingAt).toBeDefined();
    await s.finish();

    let now = await s.state();
    const ramBills = now.txs.filter((x) => x.partyId === ram);
    expect(ramBills.every((x) => x.status === "deleted")).toBe(true);
    expect(ramBills.filter((x) => x.deletedReason === "account")).toHaveLength(2);
    expect(ramBills.find((x) => x.clientId === byHand)?.deletedReason).toBeUndefined();
    const deleted = await s.account(ram);
    expect(deleted).toMatchObject({ billCount: 0, salePaisa: 0 });
    expect(deleted.deletedAt).toBeDefined();
    expect(deleted.deletedBy).toBeDefined();
    expect(deleted.deletingAt).toBeUndefined();
    expect((await s.account(sita)).salePaisa).toBe(70); // other accounts untouched
    expect(now.audit.filter((a) => a.action === "party.delete")).toMatchObject([
      { entity: "party", entityId: ram, summary: "Ram deleted, 2 bills removed" },
    ]);
    expect(await s.asAdmin.query(api.partyAdmin.removedWithAccountCount, { id: ram })).toBe(2);
    expectTotalsMatchBills(now);

    await s.restoreAccount(ram);
    expect((await s.account(ram)).deletedAt).toBeUndefined(); // back at once
    await s.finish();
    now = await s.state();
    expect((await s.account(ram)).salePaisa).toBe(300);
    expect(now.txs.find((x) => x.clientId === byHand)?.status).toBe("deleted"); // stays removed
    expect(now.txs.filter((x) => x.deletedReason === "account")).toHaveLength(0);
    expect(now.audit.filter((a) => a.action === "party.restore")).toMatchObject([
      { summary: "Ram brought back, 2 bills restored" },
    ]);
    expect(now.audit.filter((a) => a.action === "party.revive")).toHaveLength(0);
    expectTotalsMatchBills(now);
  });

  it("works in batches: every bill goes, and the account is marked deleted once", async () => {
    const s = await setup();
    const ram = await s.party("Ram");
    for (const amount of [1, 2, 3, 4, 5]) await s.bill(ram, amount);
    await s.t.run((ctx) => ctx.db.patch(ram, { deletingAt: 42 }));
    const actorId = (await s.state()).audit[0]?.actorId;
    if (!actorId) throw new Error("no actor");
    await s.t.mutation(internal.partyAdmin.deleteBatch, {
      partyId: ram,
      actorId,
      run: 42,
      removed: 0,
      batch: 2,
    });
    await s.finish();
    const now = await s.state();
    expect(now.txs.every((x) => x.status === "deleted")).toBe(true);
    expect(now.audit.filter((a) => a.action === "party.delete")).toMatchObject([
      { summary: "Ram deleted, 5 bills removed" },
    ]);
    expectTotalsMatchBills(now);

    await s.t.mutation(internal.partyAdmin.restoreBatch, {
      partyId: ram,
      actorId,
      restored: 0,
      batch: 2,
    });
    await s.finish();
    // Not "brought back" yet (restoreAccount does that first), so the batch stops at once.
    expect((await s.state()).txs.every((x) => x.status === "deleted")).toBe(true);
    await s.restoreAccount(ram);
    await s.finish();
    expect((await s.account(ram)).salePaisa).toBe(15);
    expectTotalsMatchBills(await s.state());
  });

  it("running it again continues a stuck delete, and only one run finishes it", async () => {
    const s = await setup();
    const ram = await s.party("Ram");
    await s.bill(ram, 100);
    await s.deleteAccount(ram); // run 1 scheduled, not run yet
    const first = (await s.account(ram)).deletingAt;
    await s.deleteAccount(ram); // continued: a new run
    expect((await s.account(ram)).deletingAt).toBeGreaterThan(first ?? 0);
    await s.finish();
    const now = await s.state();
    expect((await s.account(ram)).deletedAt).toBeDefined();
    expect(now.audit.filter((a) => a.action === "party.delete")).toMatchObject([
      { summary: "Ram deleted (continued), 1 more bill removed" },
    ]);
    expect(now.audit.filter((a) => a.action === "party.deleteRetry")).toHaveLength(1);
    await s.deleteAccount(ram); // already deleted: nothing happens
    await s.finish();
    expect((await s.state()).audit.filter((a) => a.action === "party.delete")).toHaveLength(1);
  });

  it("rule 1: a bill arriving while the delete runs brings the account back and stops it", async () => {
    const s = await setup();
    const ram = await s.party("Ram");
    await s.bill(ram, 100);
    await s.deleteAccount(ram);
    await s.bill(ram, 40); // e.g. saved offline before the delete, synced now
    await s.finish();
    const now = await s.state();
    const back = await s.account(ram);
    expect(back.deletingAt).toBeUndefined();
    expect(back.deletedAt).toBeUndefined();
    expect(back.salePaisa).toBe(140); // the delete never ran
    expect(now.audit.filter((a) => a.action === "party.revive")).toHaveLength(1);
    expect(now.audit.filter((a) => a.action === "party.delete")).toHaveLength(0);
    expectTotalsMatchBills(now);
  });

  it("rule 1: a bill arriving after the delete brings the account back; the rest follow on request", async () => {
    const s = await setup();
    const ram = await s.party("Ram");
    await s.bill(ram, 100);
    await s.bill(ram, 200);
    await s.deleteAccount(ram);
    await s.finish();
    await s.bill(ram, 5);
    expect(await s.account(ram)).toMatchObject({ billCount: 1, salePaisa: 5 });
    expect((await s.account(ram)).deletedAt).toBeUndefined();
    expect(await s.asAdmin.query(api.partyAdmin.removedWithAccountCount, { id: ram })).toBe(2);
    await s.restoreAccount(ram); // "Bring back its bills"
    await s.finish();
    expect(await s.account(ram)).toMatchObject({ billCount: 3, salePaisa: 305 });
    expectTotalsMatchBills(await s.state());
  });

  it("bringing it back while the delete runs stops it and restores what it removed", async () => {
    const s = await setup();
    const ram = await s.party("Ram");
    for (const amount of [1, 2, 3]) await s.bill(ram, amount);
    const run = 77;
    await s.t.run((ctx) => ctx.db.patch(ram, { deletingAt: run }));
    const actorId = (await s.state()).audit[0]?.actorId;
    if (!actorId) throw new Error("no actor");
    // One batch of 2 runs; the next is scheduled but the admin brings it back first.
    await s.t.mutation(internal.partyAdmin.deleteBatch, {
      partyId: ram,
      actorId,
      run,
      removed: 0,
      batch: 2,
    });
    await s.restoreAccount(ram);
    await s.finish();
    const now = await s.state();
    expect(now.txs.every((x) => x.status === "active")).toBe(true);
    expect(now.audit.filter((a) => a.action === "party.delete")).toHaveLength(0);
    expectTotalsMatchBills(now);
  });

  it("refuses non-admins, the walk-in, merged and merging accounts, and a merge target", async () => {
    const s = await setup();
    const ram = await s.party("Ram");
    const sita = await s.party("Sita");
    const hari = await s.party("Hari");
    await s.bill(ram, 10);
    await expect(s.asOwner.mutation(api.partyAdmin.deleteAccount, { id: ram })).rejects.toThrow(
      /FORBIDDEN/,
    );
    await expect(s.asOwner.mutation(api.partyAdmin.restoreAccount, { id: ram })).rejects.toThrow(
      /FORBIDDEN/,
    );
    const walkIn = (await s.state()).parties.find((p) => p.isWalkIn)?._id;
    if (!walkIn) throw new Error("no walk-in");
    await expect(s.deleteAccount(walkIn)).rejects.toThrow(/VALIDATION/);

    await s.asAdmin.mutation(api.partyAdmin.merge, { keepId: sita, mergeId: ram });
    // Before the merge's batches run: Ram is being merged, Sita is its target.
    await expect(s.deleteAccount(ram)).rejects.toThrow(/CONFLICT/);
    await expect(s.deleteAccount(sita)).rejects.toThrow(/CONFLICT/);
    await s.finish();
    await expect(s.deleteAccount(ram)).rejects.toThrow(/CONFLICT/); // merged
    await expect(s.restoreAccount(ram)).rejects.toThrow(/CONFLICT/);

    // A deleted (or deleting) account can't be edited, archived or merged.
    await s.deleteAccount(hari);
    const update = { id: hari, name: "Hari Kc", kind: "customer" as const };
    await expect(s.asAdmin.mutation(api.partyAdmin.update, update)).rejects.toThrow(/CONFLICT/);
    await s.finish();
    await expect(s.asAdmin.mutation(api.partyAdmin.update, update)).rejects.toThrow(/CONFLICT/);
    await expect(
      s.asAdmin.mutation(api.partyAdmin.setArchived, { id: hari, archived: true }),
    ).rejects.toThrow(/CONFLICT/);
    await expect(
      s.asAdmin.mutation(api.partyAdmin.merge, { keepId: hari, mergeId: sita }),
    ).rejects.toThrow(/CONFLICT/);
    await expect(
      s.asAdmin.mutation(api.partyAdmin.merge, { keepId: sita, mergeId: hari }),
    ).rejects.toThrow(/CONFLICT/);
  });

  it("a merge turns bills an earlier delete removed into ordinary removed bills", async () => {
    const s = await setup();
    const ram = await s.party("Ram");
    const sita = await s.party("Sita");
    await s.bill(ram, 100);
    await s.deleteAccount(ram);
    await s.finish();
    await s.bill(ram, 5); // brings Ram back; the 100 stays removed with the account
    await s.asAdmin.mutation(api.partyAdmin.merge, { keepId: sita, mergeId: ram });
    await s.finish();
    const moved = (await s.state()).txs.filter((x) => x.partyId === sita);
    expect(moved).toHaveLength(2);
    expect(moved.every((x) => x.deletedReason === undefined)).toBe(true);
    expect(await s.asAdmin.query(api.partyAdmin.removedWithAccountCount, { id: sita })).toBe(0);
    expectTotalsMatchBills(await s.state());
  });
});
