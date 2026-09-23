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
  const ram = await shop.asOwner.mutation(api.parties.create, {
    clientId: "party-ram",
    name: "Ram Bahadur Thapa",
    kind: "customer",
  });
  const photo = async () => {
    const [storageId, thumbId] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["full"], { type: "image/jpeg" })),
      await ctx.storage.store(new Blob(["thumb"], { type: "image/jpeg" })),
    ]);
    return { storageId, thumbId, width: 1200, height: 1600, bytes: 250_000 } as {
      storageId: Id<"_storage">;
      thumbId: Id<"_storage">;
      width: number;
      height: number;
      bytes: number;
    };
  };
  const today = todayBs(Date.now());
  const bill = async (extra: Record<string, unknown> = {}) => ({
    clientId: crypto.randomUUID(),
    kind: "sale" as const,
    dateBs: today,
    photos: [await photo()],
    ...extra,
  });
  return { t, ...shop, ram, photo, bill, today };
}

describe("transactions.createFromClient (F-03)", () => {
  it("UC-01: saves a named sale with an amount and updates Today's totals", async () => {
    const { t, asOwner, ram, bill, today } = await setup();
    const id = await asOwner.mutation(
      api.transactions.createFromClient,
      await bill({ partyRef: { id: ram }, amountPaisa: 234_000 }),
    );
    const tx = await t.run((ctx) => ctx.db.get(id));
    expect(tx).toMatchObject({
      partyId: ram,
      amountPaisa: 234_000,
      status: "active",
      needsAttention: false,
    });
    expect(await asOwner.query(api.summaries.forDate, { dateBs: today })).toEqual({
      saleCount: 1,
      salePaisa: 234_000,
      purchaseCount: 0,
      purchasePaisa: 0,
      missingAmountCount: 0,
    });
  });

  it("architecture §5.3 invariant 2: a retry with the same clientId returns the same bill, counted once", async () => {
    const { asOwner, ram, bill, today } = await setup();
    const args = await bill({ partyRef: { id: ram }, amountPaisa: 100 });
    const first = await asOwner.mutation(api.transactions.createFromClient, args);
    const again = await asOwner.mutation(api.transactions.createFromClient, {
      ...args,
      amountPaisa: 999,
    });
    expect(again).toBe(first);
    expect((await asOwner.query(api.summaries.forDate, { dateBs: today })).salePaisa).toBe(100);
  });

  it("F-04: resolves a name created on the phone by its clientId", async () => {
    const { t, asOwner, ram, bill } = await setup();
    const id = await asOwner.mutation(
      api.transactions.createFromClient,
      await bill({ partyRef: { clientId: "party-ram" } }),
    );
    expect((await t.run((ctx) => ctx.db.get(id)))?.partyId).toBe(ram);
  });

  it("UC-05: a bill whose new name hasn't synced yet is refused (CONFLICT) so the outbox retries", async () => {
    const { asOwner, bill } = await setup();
    await expect(
      asOwner.mutation(
        api.transactions.createFromClient,
        await bill({ partyRef: { clientId: "not-yet" } }),
      ),
    ).rejects.toThrow(/CONFLICT/);
  });

  it("architecture §5.3 invariant 7: a merged account resolves to the one it was merged into", async () => {
    const { t, asOwner, ram, bill } = await setup();
    const dup = await asOwner.mutation(api.parties.create, {
      clientId: "dup",
      name: "Ram B Thapa",
      kind: "customer",
    });
    await t.run((ctx) => ctx.db.patch(dup, { mergedIntoId: ram }));
    const id = await asOwner.mutation(
      api.transactions.createFromClient,
      await bill({ partyRef: { id: dup } }),
    );
    expect((await t.run((ctx) => ctx.db.get(id)))?.partyId).toBe(ram);
  });

  it("F-04 “पछि”: a bill without a name or amount needs attention", async () => {
    const { t, asOwner, bill, today } = await setup();
    const id = await asOwner.mutation(
      api.transactions.createFromClient,
      await bill({ kind: "purchase" }),
    );
    expect((await t.run((ctx) => ctx.db.get(id)))?.needsAttention).toBe(true);
    expect((await asOwner.query(api.summaries.forDate, { dateBs: today })).missingAmountCount).toBe(
      1,
    );
  });

  it("F-05: a back-dated bill counts on its own date, not today", async () => {
    const { asOwner, ram, bill, today } = await setup();
    const yesterday = addDaysBs(today, -1);
    await asOwner.mutation(
      api.transactions.createFromClient,
      await bill({ partyRef: { id: ram }, dateBs: yesterday, amountPaisa: 500 }),
    );
    expect((await asOwner.query(api.summaries.forDate, { dateBs: yesterday })).salePaisa).toBe(500);
    expect((await asOwner.query(api.summaries.forDate, { dateBs: today })).saleCount).toBe(0);
  });

  it("rejects invalid input → VALIDATION", async () => {
    const { t, asOwner, bill, photo, today } = await setup();
    const gone = await photo();
    await t.run((ctx) => ctx.storage.delete(gone.storageId));
    for (const bad of [
      await bill({ clientId: "" }),
      await bill({ dateBs: "2083-13-01" }),
      await bill({ dateBs: addDaysBs(today, 2) }), // more than a day ahead
      await bill({ amountPaisa: -1 }),
      await bill({ amountPaisa: 10.5 }),
      await bill({ photos: [] }),
      await bill({ photos: await Promise.all(Array.from({ length: 6 }, photo)) }),
      await bill({ photos: [gone] }),
    ]) {
      await expect(asOwner.mutation(api.transactions.createFromClient, bad)).rejects.toThrow(
        /VALIDATION/,
      );
    }
    expect(await t.run((ctx) => ctx.db.query("transactions").collect())).toEqual([]);
  });

  it("allows a bill dated tomorrow (phone clock slightly ahead)", async () => {
    const { asOwner, bill, today } = await setup();
    await expect(
      asOwner.mutation(
        api.transactions.createFromClient,
        await bill({ dateBs: addDaysBs(today, 1) }),
      ),
    ).resolves.toBeDefined();
  });

  it("ADR-014: the same clientId in another shop is a different bill, and other shops' accounts are refused", async () => {
    const { t, asOwner, ram, bill } = await setup();
    const args = await bill({ partyRef: { id: ram } });
    await asOwner.mutation(api.transactions.createFromClient, args);
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
    const asOther = t.withIdentity({ subject: "user_other" });
    await expect(asOther.mutation(api.transactions.createFromClient, args)).rejects.toThrow(
      /CONFLICT/,
    );
    const noParty = { ...(await bill()), clientId: args.clientId }; // same clientId, no account
    const otherId = await asOther.mutation(api.transactions.createFromClient, noParty);
    const shops = await t.run(async (ctx) =>
      (await ctx.db.query("transactions").collect()).map((x) => x.shopId),
    );
    expect(new Set(shops).size).toBe(2);
    expect(otherId).toBeDefined();
  });

  it("NFR-06: strangers get FORBIDDEN", async () => {
    const { t, bill } = await setup();
    await expect(
      t
        .withIdentity({ subject: "user_stranger" })
        .mutation(api.transactions.createFromClient, await bill()),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("transactions.listRecentForDate (F-02)", () => {
  it("lists the day's newest active bills first, with names, walk-in flag and thumbnail URLs", async () => {
    const { t, asOwner, ram, bill, today } = await setup();
    const walkIn = await t.run(async (ctx) => {
      const w = await ctx.db.query("parties").withIndex("by_shop_clientId").collect();
      return w.find((p) => p.isWalkIn)?._id;
    });
    await asOwner.mutation(
      api.transactions.createFromClient,
      await bill({ partyRef: { id: ram }, amountPaisa: 100 }),
    );
    await asOwner.mutation(
      api.transactions.createFromClient,
      await bill({ partyRef: { id: walkIn } }),
    );
    const removed = await asOwner.mutation(
      api.transactions.createFromClient,
      await bill({ kind: "purchase" }),
    );
    await t.run((ctx) => ctx.db.patch(removed, { status: "deleted" }));

    const list = await asOwner.query(api.transactions.listRecentForDate, { dateBs: today });
    expect(list.map((x) => [x.partyName, x.isWalkIn, x.amountPaisa])).toEqual([
      ["नगद ग्राहक", true, undefined],
      ["Ram Bahadur Thapa", false, 100],
    ]);
    expect(list.every((x) => typeof x.thumbUrl === "string")).toBe(true);
  });

  it("clamps the limit to 1–10", async () => {
    const { asOwner, bill, today } = await setup();
    for (let i = 0; i < 12; i++)
      await asOwner.mutation(api.transactions.createFromClient, await bill());
    expect(
      await asOwner.query(api.transactions.listRecentForDate, { dateBs: today, limit: 50 }),
    ).toHaveLength(10);
    expect(
      await asOwner.query(api.transactions.listRecentForDate, { dateBs: today, limit: 0 }),
    ).toHaveLength(1);
    expect(await asOwner.query(api.transactions.listRecentForDate, { dateBs: today })).toHaveLength(
      5,
    );
  });

  it("rejects an invalid date", async () => {
    const { asOwner } = await setup();
    await expect(
      asOwner.query(api.transactions.listRecentForDate, { dateBs: "x" }),
    ).rejects.toThrow(/VALIDATION/);
    await expect(asOwner.query(api.summaries.forDate, { dateBs: "2083-00-01" })).rejects.toThrow(
      /VALIDATION/,
    );
  });
});

describe("clientCapturedAt (M2)", () => {
  it("orders recent bills by when they were taken, not when they synced", async () => {
    const { asOwner, bill, today } = await setup();
    const now = Date.now();
    await asOwner.mutation(
      api.transactions.createFromClient,
      await bill({ amountPaisa: 1, clientCapturedAt: now - 60_000 }),
    );
    await asOwner.mutation(
      api.transactions.createFromClient,
      await bill({ amountPaisa: 2, clientCapturedAt: now - 3_600_000 }),
    );
    await asOwner.mutation(api.transactions.createFromClient, await bill({ amountPaisa: 3 }));
    const list = await asOwner.query(api.transactions.listRecentForDate, { dateBs: today });
    expect(list.map((x) => x.amountPaisa)).toEqual([3, 1, 2]); // synced last, but taken first → last
  });

  it("drops a phone time that's clearly wrong instead of refusing the bill", async () => {
    const { t, asOwner, bill } = await setup();
    const ok = await asOwner.mutation(
      api.transactions.createFromClient,
      await bill({ clientCapturedAt: Date.now() - 5_000 }),
    );
    const future = await asOwner.mutation(
      api.transactions.createFromClient,
      await bill({ clientCapturedAt: Date.now() + 3 * 86_400_000 }),
    );
    const ancient = await asOwner.mutation(
      api.transactions.createFromClient,
      await bill({ clientCapturedAt: 1 }),
    );
    const rows = await t.run(async (ctx) =>
      Promise.all([ok, future, ancient].map((id) => ctx.db.get(id))),
    );
    expect(rows[0]?.clientCapturedAt).toBeTypeOf("number");
    expect(rows[1]).not.toHaveProperty("clientCapturedAt");
    expect(rows[2]).not.toHaveProperty("clientCapturedAt");
  });
});

describe("files.generateUploadUrl (F-03)", () => {
  it("gives members an upload URL and refuses strangers", async () => {
    const { t, asOwner } = await setup();
    expect(typeof (await asOwner.mutation(api.files.generateUploadUrl, {}))).toBe("string");
    await expect(
      t.withIdentity({ subject: "user_stranger" }).mutation(api.files.generateUploadUrl, {}),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
