import { addDaysBs, todayBs } from "@mero-pasal/shared/dates";
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
  const photo = async () => {
    const [storageId, thumbId] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["full"])),
      await ctx.storage.store(new Blob(["thumb"])),
    ]);
    return { storageId, thumbId, width: 1, height: 1, bytes: 1 } as {
      storageId: Id<"_storage">;
      thumbId: Id<"_storage">;
      width: number;
      height: number;
      bytes: number;
    };
  };
  const add = async (
    as: typeof shop.asOwner,
    extra: { kind?: "sale" | "purchase"; dateBs?: string; amountPaisa?: number } = {},
  ) =>
    as.mutation(api.transactions.createFromClient, {
      clientId: crypto.randomUUID(),
      kind: extra.kind ?? "sale",
      dateBs: extra.dateBs ?? today,
      photos: [await photo()],
      ...(extra.amountPaisa === undefined ? {} : { amountPaisa: extra.amountPaisa }),
    });
  return { t, ...shop, today, add };
}

const page = (numItems: number, cursor: string | null = null) => ({ numItems, cursor });

describe("transactions.listByDate (F-06)", () => {
  it("pages through active bills, newest date first, thumbnails only", async () => {
    const { t, asOwner, today, add } = await setup();
    await add(asOwner, { dateBs: addDaysBs(today, -2), amountPaisa: 100 });
    await add(asOwner, { dateBs: today, amountPaisa: 200 });
    await add(asOwner, { dateBs: addDaysBs(today, -1), amountPaisa: 300 });
    const removed = await add(asOwner, { dateBs: today, amountPaisa: 999 });
    await t.run((ctx) => ctx.db.patch(removed, { status: "deleted" }));

    const first = await asOwner.query(api.transactions.listByDate, {
      filter: "all",
      paginationOpts: page(2),
    });
    expect(first.page.map((b) => b.amountPaisa)).toEqual([200, 300]);
    expect(first.isDone).toBe(false);
    const second = await asOwner.query(api.transactions.listByDate, {
      filter: "all",
      paginationOpts: page(2, first.continueCursor),
    });
    expect(second.page.map((b) => [b.dateBs, b.amountPaisa])).toEqual([
      [addDaysBs(today, -2), 100],
    ]);
    expect(second.isDone).toBe(true);
    expect(first.page.every((b) => typeof b.thumbUrl === "string")).toBe(true);
    expect(first.page[0]).not.toHaveProperty("photos");
  });

  it("filters sold, bought and no-amount bills (F-06 chips)", async () => {
    const { t, asOwner, add } = await setup();
    await add(asOwner, { kind: "sale", amountPaisa: 100 });
    await add(asOwner, { kind: "purchase", amountPaisa: 200 });
    await add(asOwner, { kind: "sale" });
    const noAmountRemoved = await add(asOwner, { kind: "purchase" });
    await t.run((ctx) =>
      ctx.db.patch(noAmountRemoved, { status: "deleted", needsAttention: false }),
    );
    const list = async (filter: "sale" | "purchase" | "noAmount") =>
      (
        await asOwner.query(api.transactions.listByDate, { filter, paginationOpts: page(10) })
      ).page.map((b) => [b.kind, b.amountPaisa]);

    expect(await list("sale")).toEqual([
      ["sale", undefined],
      ["sale", 100],
    ]);
    expect(await list("purchase")).toEqual([["purchase", 200]]);
    expect(await list("noAmount")).toEqual([["sale", undefined]]);
  });

  it("never shows another shop's bills, and strangers are refused (ADR-014, NFR-06)", async () => {
    const { t, asOwner, add } = await setup();
    await add(asOwner, { amountPaisa: 100 });
    await t.mutation(internal.e2eSupport.ensureE2eShop, {
      clerkUserId: "user_other",
      email: "other+clerk_test@example.com",
    });
    const other = t.withIdentity({ subject: "user_other" });
    const theirs = await other.query(api.transactions.listByDate, {
      filter: "all",
      paginationOpts: page(10),
    });
    expect(theirs.page).toEqual([]);
    await expect(
      t
        .withIdentity({ subject: "user_stranger" })
        .query(api.transactions.listByDate, { filter: "all", paginationOpts: page(10) }),
    ).rejects.toThrow(/FORBIDDEN|UNAUTHENTICATED/);
  });
});
