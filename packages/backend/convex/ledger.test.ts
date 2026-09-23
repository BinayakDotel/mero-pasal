import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { memberMutation } from "./lib/functions";
import { apply, type TxDoc, type TxDraft } from "./lib/ledger";
import schema from "./schema";
import { modules, seedShop } from "./test.setup";

// Test-only mutations that drive ledger.apply directly (the real callers arrive in PR 6).
// They live only in this test's module map, so nothing here is deployed.
type Ctx = MutationCtx & { member: { _id: Id<"members"> }; shopId: Id<"shops"> };
const who = (ctx: Ctx, action: string) => ({ actorId: ctx.member._id, action, summary: action });

function draftFrom(before: TxDoc): TxDraft {
  const { _id, _creationTime, needsAttention, updatedAt, ...rest } = before;
  return rest;
}

const probes = {
  create: memberMutation({
    args: {
      kind: v.union(v.literal("sale"), v.literal("purchase")),
      dateBs: v.string(),
      partyId: v.optional(v.id("parties")),
      amountPaisa: v.optional(v.number()),
    },
    handler: async (ctx, a) =>
      apply(
        ctx,
        null,
        {
          shopId: ctx.shopId,
          clientId: crypto.randomUUID(),
          kind: a.kind,
          dateBs: a.dateBs,
          dateAd: 0,
          ...(a.partyId === undefined ? {} : { partyId: a.partyId }),
          ...(a.amountPaisa === undefined ? {} : { amountPaisa: a.amountPaisa }),
          photos: [],
          status: "active",
          capturedAt: Date.now(),
          createdBy: ctx.member._id,
        },
        who(ctx, "tx.create"),
      ),
  }),
  update: memberMutation({
    args: {
      id: v.id("transactions"),
      kind: v.optional(v.union(v.literal("sale"), v.literal("purchase"))),
      dateBs: v.optional(v.string()),
      partyId: v.optional(v.union(v.id("parties"), v.null())),
      amountPaisa: v.optional(v.union(v.number(), v.null())),
      status: v.optional(v.union(v.literal("active"), v.literal("deleted"))),
    },
    handler: async (ctx, { id, ...patch }) => {
      const before = await ctx.db.get(id);
      if (!before) throw new Error("missing tx");
      const after = draftFrom(before);
      if (patch.kind !== undefined) after.kind = patch.kind;
      if (patch.dateBs !== undefined) after.dateBs = patch.dateBs;
      if (patch.status !== undefined) after.status = patch.status;
      if (patch.partyId === null) delete after.partyId;
      else if (patch.partyId !== undefined) after.partyId = patch.partyId;
      if (patch.amountPaisa === null) delete after.amountPaisa;
      else if (patch.amountPaisa !== undefined) after.amountPaisa = patch.amountPaisa;
      return apply(ctx, before, after, who(ctx, "tx.update"));
    },
  }),
  staleUpdate: memberMutation({
    args: { id: v.id("transactions") },
    handler: async (ctx, { id }) => {
      const before = await ctx.db.get(id);
      if (!before) throw new Error("missing tx");
      const stale = { ...before, updatedAt: before.updatedAt - 1 };
      return apply(ctx, stale, { ...draftFrom(before), amountPaisa: 999 }, who(ctx, "tx.update"));
    },
  }),
};
const p = {
  create: makeFunctionReference<"mutation">("probes:create"),
  update: makeFunctionReference<"mutation">("probes:update"),
  staleUpdate: makeFunctionReference<"mutation">("probes:staleUpdate"),
};

async function setup() {
  const t = convexTest(schema, { ...modules, "./probes.ts": async () => probes });
  const shop = await seedShop(t);
  const mk = (clientId: string, name: string) =>
    shop.asOwner.mutation(api.parties.create, { clientId, name, kind: "customer" });
  const ram = await mk("ram", "Ram");
  const sita = await mk("sita", "Sita");
  const walkIn = await t.run(async (ctx) => {
    const w = await ctx.db
      .query("parties")
      .filter((q) => q.eq(q.field("isWalkIn"), true))
      .first();
    if (!w) throw new Error("no walk-in");
    return w._id;
  });
  return { t, ...shop, ram, sita, walkIn };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** The ledger's view of the world, read straight from the tables. */
async function stored(t: Setup["t"]) {
  return t.run(async (ctx) => ({
    daily: await ctx.db.query("dailySummaries").collect(),
    monthly: await ctx.db.query("partyMonthly").collect(),
    parties: await ctx.db.query("parties").collect(),
    txs: await ctx.db.query("transactions").collect(),
  }));
}

describe("ledger.apply scenarios (architecture §7.4)", () => {
  it("F-02 / F-03: a new named sale updates the day, the account-month, the account and the audit trail", async () => {
    const { t, asOwner, ram } = await setup();
    const id = await asOwner.mutation(p.create, {
      kind: "sale",
      dateBs: "2083-06-07",
      partyId: ram,
      amountPaisa: 234_000,
    });
    const s = await stored(t);
    expect(s.daily).toEqual([
      expect.objectContaining({
        dateBs: "2083-06-07",
        saleCount: 1,
        salePaisa: 234_000,
        missingAmountCount: 0,
      }),
    ]);
    expect(s.monthly).toEqual([
      expect.objectContaining({
        partyId: ram,
        monthBs: "2083-06",
        billCount: 1,
        salePaisa: 234_000,
      }),
    ]);
    expect(s.parties.find((x) => x._id === ram)).toMatchObject({
      billCount: 1,
      salePaisa: 234_000,
      lastBillDateBs: "2083-06-07",
      lastBillPaisa: 234_000,
    });
    expect(s.txs[0]).toMatchObject({ _id: id, needsAttention: false });
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit[audit.length - 1]).toMatchObject({
      action: "tx.create",
      entity: "transaction",
      entityId: id,
    });
  });

  it("F-02: a bill without an amount or name needs attention and counts as missing", async () => {
    const { t, asOwner } = await setup();
    await asOwner.mutation(p.create, { kind: "purchase", dateBs: "2083-06-07" });
    const s = await stored(t);
    expect(s.txs[0]?.needsAttention).toBe(true);
    expect(s.daily[0]).toMatchObject({ purchaseCount: 1, purchasePaisa: 0, missingAmountCount: 1 });
    expect(s.monthly).toEqual([]);
  });

  it("ADR-030: removing the latest bill falls back to the previous one, then clears", async () => {
    const { t, asOwner, ram } = await setup();
    const older = await asOwner.mutation(p.create, {
      kind: "sale",
      dateBs: "2083-06-05",
      partyId: ram,
      amountPaisa: 100,
    });
    const newer = await asOwner.mutation(p.create, {
      kind: "sale",
      dateBs: "2083-06-07",
      partyId: ram,
    });
    let party = (await stored(t)).parties.find((x) => x._id === ram);
    expect(party).toMatchObject({ lastBillDateBs: "2083-06-07" });
    expect(party).not.toHaveProperty("lastBillPaisa"); // latest bill has no amount

    await asOwner.mutation(p.update, { id: newer, status: "deleted" });
    party = (await stored(t)).parties.find((x) => x._id === ram);
    expect(party).toMatchObject({ lastBillDateBs: "2083-06-05", lastBillPaisa: 100 });

    await asOwner.mutation(p.update, { id: older, status: "deleted" });
    party = (await stored(t)).parties.find((x) => x._id === ram);
    expect(party).not.toHaveProperty("lastBillDateBs");
    expect(party).toMatchObject({ billCount: 0, salePaisa: 0 });
  });

  it("F-04: recency moves forward when a bill lands, never on an amount edit", async () => {
    const { t, asOwner, ram } = await setup();
    await t.run((ctx) => ctx.db.patch(ram, { lastUsedAt: 1 }));
    const id = await asOwner.mutation(p.create, {
      kind: "sale",
      dateBs: "2083-06-07",
      partyId: ram,
    });
    const used = (await stored(t)).parties.find((x) => x._id === ram)?.lastUsedAt ?? 0;
    expect(used).toBeGreaterThan(1);
    await t.run((ctx) => ctx.db.patch(ram, { lastUsedAt: 5 }));
    await asOwner.mutation(p.update, { id, amountPaisa: 900 });
    expect((await stored(t)).parties.find((x) => x._id === ram)?.lastUsedAt).toBe(5);
  });

  it("F-04: recency also moves when a bill is moved to an account or restored onto it", async () => {
    const { t, asOwner, ram, sita } = await setup();
    const id = await asOwner.mutation(p.create, {
      kind: "sale",
      dateBs: "2083-06-07",
      partyId: ram,
    });
    await t.run((ctx) => ctx.db.patch(sita, { lastUsedAt: 1 }));
    await asOwner.mutation(p.update, { id, partyId: sita });
    expect((await stored(t)).parties.find((x) => x._id === sita)?.lastUsedAt).toBeGreaterThan(1);
    await asOwner.mutation(p.update, { id, status: "deleted" });
    await t.run((ctx) => ctx.db.patch(sita, { lastUsedAt: 2 }));
    await asOwner.mutation(p.update, { id, status: "active" });
    expect((await stored(t)).parties.find((x) => x._id === sita)?.lastUsedAt).toBeGreaterThan(2);
  });

  it("F-11: a removed bill never needs attention", async () => {
    const { t, asOwner } = await setup();
    const id = await asOwner.mutation(p.create, { kind: "sale", dateBs: "2083-06-07" });
    await asOwner.mutation(p.update, { id, status: "deleted" });
    expect((await stored(t)).txs[0]?.needsAttention).toBe(false);
  });

  it("ADR-014: a member of another shop cannot touch this shop's bill", async () => {
    const { t, asOwner, ram } = await setup();
    const id = await asOwner.mutation(p.create, {
      kind: "sale",
      dateBs: "2083-06-07",
      partyId: ram,
      amountPaisa: 100,
    });
    await t.run(async (ctx) => {
      const other = await ctx.db.insert("shops", { name: "Other", createdAt: 0 });
      await ctx.db.insert("members", {
        shopId: other,
        clerkUserId: "user_other",
        displayName: "Other",
        role: "owner",
        locale: "en",
        active: true,
      });
    });
    await expect(
      t.withIdentity({ subject: "user_other" }).mutation(p.update, { id, amountPaisa: 1 }),
    ).rejects.toThrow(/FORBIDDEN|NOT_FOUND/);
    expect((await stored(t)).txs[0]?.amountPaisa).toBe(100);
  });

  it("refuses a stale copy of the bill (CONFLICT), leaving totals untouched", async () => {
    const { t, asOwner, ram } = await setup();
    const id = await asOwner.mutation(p.create, {
      kind: "sale",
      dateBs: "2083-06-07",
      partyId: ram,
      amountPaisa: 100,
    });
    await expect(asOwner.mutation(p.staleUpdate, { id })).rejects.toThrow(/CONFLICT/);
    expect((await stored(t)).daily[0]?.salePaisa).toBe(100);
  });

  it("refuses an account from another shop, and a merged account", async () => {
    const { t, asOwner, ram, sita } = await setup();
    const foreign = await t.run(async (ctx) => {
      const shop = await ctx.db.insert("shops", { name: "Other", createdAt: 0 });
      const creator = await ctx.db.query("members").first();
      if (!creator) throw new Error("no member");
      return ctx.db.insert("parties", {
        shopId: shop,
        clientId: "x",
        kind: "customer",
        displayName: "X",
        nameLatin: "X",
        phoneticKey: "x",
        isWalkIn: false,
        archived: false,
        lastUsedAt: 0,
        billCount: 0,
        salePaisa: 0,
        purchasePaisa: 0,
        balancePaisa: 0,
        createdBy: creator._id,
        createdAt: 0,
      });
    });
    await expect(
      asOwner.mutation(p.create, { kind: "sale", dateBs: "2083-06-07", partyId: foreign }),
    ).rejects.toThrow(/NOT_FOUND/);
    await t.run((ctx) => ctx.db.patch(sita, { mergedIntoId: ram }));
    await expect(
      asOwner.mutation(p.create, { kind: "sale", dateBs: "2083-06-07", partyId: sita }),
    ).rejects.toThrow(/CONFLICT/);
    expect((await stored(t)).txs).toEqual([]); // nothing half-written
  });

  it("refuses to drive a total negative if derived data had already drifted", async () => {
    const { t, asOwner, ram } = await setup();
    const id = await asOwner.mutation(p.create, {
      kind: "sale",
      dateBs: "2083-06-07",
      partyId: ram,
      amountPaisa: 500,
    });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("dailySummaries").first();
      if (row) await ctx.db.patch(row._id, { saleCount: 0 }); // simulate drift
    });
    await expect(asOwner.mutation(p.update, { id, status: "deleted" })).rejects.toThrow(
      /Ledger invariant/,
    );
    expect((await stored(t)).txs[0]?.status).toBe("active"); // the whole mutation rolled back
  });
});

// Architecture §5.3 invariant 3: derived data always equals a from-scratch recount of active
// bills. The recount below is deliberately naive and does not use `contribution()`.
describe("ledger invariant (property, seeded)", () => {
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let x = s;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
  const DATES = ["2083-05-30", "2083-05-31", "2083-06-01", "2083-06-07"];
  const AMOUNTS = [undefined, 0, 90_000, 234_000, 4_230_000];

  function recount(s: Awaited<ReturnType<typeof stored>>) {
    const daily = new Map<string, number[]>();
    const monthly = new Map<string, number[]>();
    const party = new Map<string, number[]>();
    const last = new Map<string, TxDoc>();
    const bump = (m: Map<string, number[]>, key: string, add: number[]) =>
      m.set(
        key,
        (m.get(key) ?? add.map(() => 0)).map((n, i) => n + (add[i] ?? 0)),
      );
    const active = s.txs
      .filter((x) => x.status === "active")
      .sort((a, b) => a.dateBs.localeCompare(b.dateBs) || a._creationTime - b._creationTime);
    for (const x of active) {
      const amt = x.amountPaisa ?? 0;
      const isSale = x.kind === "sale";
      bump(daily, x.dateBs, [
        isSale ? 1 : 0,
        isSale ? amt : 0,
        isSale ? 0 : 1,
        isSale ? 0 : amt,
        x.amountPaisa === undefined ? 1 : 0,
      ]);
      if (x.partyId) {
        bump(monthly, `${x.partyId}|${x.dateBs.slice(0, 7)}`, [
          1,
          isSale ? amt : 0,
          isSale ? 0 : amt,
        ]);
        bump(party, x.partyId, [1, isSale ? amt : 0, isSale ? 0 : amt]);
        last.set(x.partyId, x); // sorted ascending, so the final write is the latest
      }
    }
    const nonZero = (m: Map<string, number[]>) =>
      new Map([...m].filter(([, vals]) => vals.some((n) => n !== 0)));
    return { daily: nonZero(daily), monthly: nonZero(monthly), party, last };
  }

  function actual(s: Awaited<ReturnType<typeof stored>>) {
    const nonZero = (m: Map<string, number[]>) =>
      new Map([...m].filter(([, vals]) => vals.some((n) => n !== 0)));
    return {
      daily: nonZero(
        new Map(
          s.daily.map((d) => [
            d.dateBs,
            [d.saleCount, d.salePaisa, d.purchaseCount, d.purchasePaisa, d.missingAmountCount],
          ]),
        ),
      ),
      monthly: nonZero(
        new Map(
          s.monthly.map((m) => [
            `${m.partyId}|${m.monthBs}`,
            [m.billCount, m.salePaisa, m.purchasePaisa],
          ]),
        ),
      ),
    };
  }

  it.each([1, 42, 2083, 31337])(
    "seed %i: 150 random operations, checked after every one",
    async (seed) => {
      const r = rng(seed);
      const { t, asOwner, ram, sita, walkIn } = await setup();
      const parties = [ram, sita, walkIn, undefined] as const;
      const ids: Id<"transactions">[] = [];

      for (let step = 0; step < 150; step++) {
        const op =
          ids.length === 0
            ? "create"
            : pick(r, ["create", "create", "edit", "edit", "remove", "restore"] as const);
        if (op === "create") {
          const partyId = pick(r, parties);
          const amountPaisa = pick(r, AMOUNTS);
          ids.push(
            await asOwner.mutation(p.create, {
              kind: pick(r, ["sale", "purchase"] as const),
              dateBs: pick(r, DATES),
              ...(partyId === undefined ? {} : { partyId }),
              ...(amountPaisa === undefined ? {} : { amountPaisa }),
            }),
          );
        } else {
          const id = pick(r, ids);
          const patch =
            op === "remove"
              ? { status: "deleted" as const }
              : op === "restore"
                ? { status: "active" as const }
                : pick(r, [
                    { kind: pick(r, ["sale", "purchase"] as const) },
                    { dateBs: pick(r, DATES) },
                    { partyId: pick(r, parties) ?? null },
                    { amountPaisa: pick(r, AMOUNTS) ?? null },
                    {
                      kind: pick(r, ["sale", "purchase"] as const),
                      dateBs: pick(r, DATES),
                      partyId: pick(r, parties) ?? null,
                      amountPaisa: pick(r, AMOUNTS) ?? null,
                    },
                  ]);
          await asOwner.mutation(p.update, { id, ...patch });
        }

        const s = await stored(t);
        const want = recount(s);
        const got = actual(s);
        expect(got.daily, `step ${step} (${op}): dailySummaries`).toEqual(want.daily);
        expect(got.monthly, `step ${step} (${op}): partyMonthly`).toEqual(want.monthly);
        for (const party of s.parties) {
          const totals = want.party.get(party._id) ?? [0, 0, 0];
          expect(
            [party.billCount, party.salePaisa, party.purchasePaisa],
            `step ${step}: ${party.displayName} totals`,
          ).toEqual(totals);
          const last = want.last.get(party._id);
          expect(
            [party.lastBillDateBs, party.lastBillPaisa],
            `step ${step}: ${party.displayName} last bill`,
          ).toEqual([last?.dateBs, last?.amountPaisa]);
        }
        for (const x of s.txs) {
          expect(x.needsAttention, `step ${step}: needsAttention`).toBe(
            x.status === "active" && (x.amountPaisa === undefined || x.partyId === undefined),
          );
        }
      }
    },
    120_000,
  );
});
