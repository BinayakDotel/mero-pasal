import { bsToAdMs, todayBs } from "@mero-pasal/shared/dates";
import { deriveNames } from "@mero-pasal/shared/names";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { appError } from "./lib/errors";
import { apply } from "./lib/ledger";
import { insertWalkIn, WALK_IN_CLIENT_ID } from "./seed";

// M2 e2e (plan PR 9): Playwright sets up its own shop and checks what reached the server through
// `convex run` against the DEV deployment. Internal only: not callable from any client.

/** Test bills live in their own shop, so they never touch the real shop's totals. */
export const E2E_SHOP_NAME = "E2E test shop";

/**
 * Idempotent: the E2E shop with its walk-in account and the Clerk dev test user as its admin
 * (M4: admin can do everything an owner can in the phone app, plus /admin).
 * Refuses a user who already belongs to another shop (never moves a real member).
 */
export const ensureE2eShop = internalMutation({
  args: { clerkUserId: v.string(), email: v.string() },
  returns: v.id("shops"),
  handler: async (ctx, { clerkUserId, email }) => {
    if (!email.includes("+clerk_test@")) {
      throw appError("VALIDATION", "Only Clerk test users (…+clerk_test@…) can join the E2E shop");
    }
    const now = Date.now();
    // The member first: it knows its shop, however many shops dev has.
    const existing = await ctx.db
      .query("members")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    const existingShop = existing ? await ctx.db.get(existing.shopId) : null;
    if (existing && existingShop?.name !== E2E_SHOP_NAME) {
      throw appError("CONFLICT", "This Clerk user already belongs to another shop");
    }
    const shopId =
      existing?.shopId ??
      (await ctx.db.query("shops").take(50)).find((s) => s.name === E2E_SHOP_NAME)?._id ??
      (await ctx.db.insert("shops", { name: E2E_SHOP_NAME, createdAt: now }));

    let memberId = existing?._id;
    if (existing && (!existing.active || existing.role !== "admin")) {
      await ctx.db.patch(existing._id, { active: true, role: "admin" });
    }
    memberId ??= await ctx.db.insert("members", {
      shopId,
      clerkUserId,
      displayName: "E2E",
      role: "admin",
      locale: "ne",
      active: true,
      email: email.trim().toLowerCase(),
    });

    const walkIn = await ctx.db
      .query("parties")
      .withIndex("by_shop_clientId", (q) =>
        q.eq("shopId", shopId).eq("clientId", WALK_IN_CLIENT_ID),
      )
      .unique();
    if (!walkIn) await insertWalkIn(ctx, shopId, memberId, now);
    return shopId;
  },
});

/**
 * M4 invite e2e: removes a Clerk test invitee's member row (and its sync row) from the E2E shop,
 * so every run starts from a fresh invite. Test rows only: never another shop, never a real email.
 */
export const resetE2eInvite = internalMutation({
  args: { email: v.string() },
  returns: v.number(),
  handler: async (ctx, { email }) => {
    const address = email.trim().toLowerCase();
    if (!address.includes("+clerk_test@")) {
      throw appError("VALIDATION", "Only Clerk test users (…+clerk_test@…) can be reset");
    }
    const shop = (await ctx.db.query("shops").take(50)).find((s) => s.name === E2E_SHOP_NAME);
    if (!shop) return 0;
    const rows = (
      await ctx.db
        .query("members")
        .withIndex("by_email", (q) => q.eq("email", address))
        .take(10)
    ).filter((m) => m.shopId === shop._id);
    for (const row of rows) {
      const sync = await ctx.db
        .query("memberSync")
        .withIndex("by_member", (q) => q.eq("memberId", row._id))
        .unique();
      if (sync) await ctx.db.delete(sync._id);
      await ctx.db.delete(row._id);
    }
    return rows.length;
  },
});

/** Which of these phone-made bills reached the E2E shop, with their photo counts. */
export const billsByClientIds = internalQuery({
  args: { clientIds: v.array(v.string()) },
  returns: v.array(v.object({ clientId: v.string(), photos: v.number(), status: v.string() })),
  handler: async (ctx, { clientIds }) => {
    const shop = (await ctx.db.query("shops").take(50)).find((s) => s.name === E2E_SHOP_NAME);
    if (!shop) return [];
    const found = [];
    for (const clientId of clientIds.slice(0, 50)) {
      const row = await ctx.db
        .query("transactions")
        .withIndex("by_shop_clientId", (q) => q.eq("shopId", shop._id).eq("clientId", clientId))
        .unique();
      if (row) found.push({ clientId, photos: row.photos.length, status: row.status });
    }
    return found;
  },
});

const SEED_KEEP_BILLS = 20;
const SEED_MERGE_BILLS = 17;

/** The E2E shop and its admin (the Clerk test user), or VALIDATION. */
async function e2eShop(ctx: MutationCtx) {
  const shop = (await ctx.db.query("shops").take(50)).find((s) => s.name === E2E_SHOP_NAME);
  if (!shop) throw appError("VALIDATION", "Run ensureE2eShop first");
  const admin = (
    await ctx.db
      .query("members")
      .withIndex("by_shop", (q) => q.eq("shopId", shop._id))
      .take(100)
  ).find((m) => m.active && m.role === "admin" && m.email?.includes("+clerk_test@"));
  if (!admin) throw appError("VALIDATION", "The E2E shop has no test admin");
  return { shopId: shop._id, admin };
}

const TOKEN = /^[a-z]{3,12}$/;

/**
 * Creates test accounts and bills in the E2E shop, through ledger.apply like any bill. Photos
 * reuse an existing E2E bill's files (a mutation can't upload). `token` keeps names unique per
 * run, so tests never touch data another test (or a phone-app test) is using.
 */
async function seeder(ctx: MutationCtx, token: string) {
  if (!TOKEN.test(token)) throw appError("VALIDATION", "token: 3–12 letters a–z");
  const { shopId, admin } = await e2eShop(ctx);
  const sample = await ctx.db
    .query("transactions")
    .withIndex("by_shop_status_date", (q) => q.eq("shopId", shopId).eq("status", "active"))
    .first();
  if (!sample || sample.photos.length === 0) {
    throw appError("VALIDATION", "The E2E shop needs one bill with a photo first");
  }
  const now = Date.now();
  const dateBs = todayBs(now);
  let n = 0;
  return {
    account: (name: string, phone?: string) => {
      const names = deriveNames(name);
      return ctx.db.insert("parties", {
        shopId,
        clientId: `seed-${token}-${name}`,
        kind: "customer",
        displayName: names.displayName,
        nameLatin: names.nameLatin,
        ...(names.nameDevanagari === undefined ? {} : { nameDevanagari: names.nameDevanagari }),
        phoneticKey: names.phoneticKey,
        ...(phone === undefined ? {} : { phone }),
        isWalkIn: false,
        archived: false,
        lastUsedAt: now,
        billCount: 0,
        salePaisa: 0,
        purchasePaisa: 0,
        balancePaisa: 0,
        createdBy: admin._id,
        createdAt: now,
      });
    },
    bill: async (partyId: Id<"parties"> | undefined, amountPaisa: number | undefined) => {
      const clientId = `seed-${token}-${n++}`;
      await apply(
        { ...ctx, shopId },
        null,
        {
          shopId,
          clientId,
          kind: "sale",
          ...(partyId ? { partyId } : {}),
          dateBs,
          dateAd: bsToAdMs(dateBs),
          ...(amountPaisa === undefined ? {} : { amountPaisa }),
          photos: sample.photos,
          status: "active",
          capturedAt: now,
          createdBy: admin._id,
        } satisfies Omit<
          Doc<"transactions">,
          "_id" | "_creationTime" | "needsAttention" | "updatedAt"
        >,
        { actorId: admin._id, action: "tx.create", summary: "e2e seed" },
      );
      return clientId;
    },
  };
}

/**
 * M4 UC-09 e2e: a duplicate pair (same phone; the kept account has more bills, so the console
 * suggests keeping it) and two needs-attention bills.
 */
export const seedUc09 = internalMutation({
  args: { token: v.string(), phone: v.string(), noNamePaisa: v.number() },
  returns: v.object({
    keepId: v.id("parties"),
    mergeId: v.id("parties"),
    keepName: v.string(),
    mergeName: v.string(),
  }),
  handler: async (ctx, { token, phone, noNamePaisa }) => {
    if (!/^\d{10}$/.test(phone)) throw appError("VALIDATION", "phone: 10 digits");
    const seed = await seeder(ctx, token);
    const keepName = `UC Keep ${token}`;
    const mergeName = `UC Dup ${token}`;
    const keepId = await seed.account(keepName, phone);
    const mergeId = await seed.account(mergeName, phone);
    for (let i = 0; i < SEED_KEEP_BILLS; i++) await seed.bill(keepId, 10_000);
    for (let i = 0; i < SEED_MERGE_BILLS; i++) await seed.bill(mergeId, 5_000);
    await seed.bill(keepId, undefined); // needs an amount
    await seed.bill(undefined, noNamePaisa); // needs a name
    return { keepId, mergeId, keepName, mergeName };
  },
});

const MAX_FIXTURE_BILLS = 20;

/**
 * M4 admin e2e: one account with bills of its own (one by default, Rs 123 each), for a test to
 * edit, remove, archive or delete. `clientId` is its first bill.
 */
export const seedAdminFixture = internalMutation({
  args: { token: v.string(), bills: v.optional(v.number()) },
  returns: v.object({ partyId: v.id("parties"), partyName: v.string(), clientId: v.string() }),
  handler: async (ctx, { token, bills = 1 }) => {
    if (!Number.isInteger(bills) || bills < 1 || bills > MAX_FIXTURE_BILLS) {
      throw appError("VALIDATION", `bills: 1–${MAX_FIXTURE_BILLS}`);
    }
    const seed = await seeder(ctx, token);
    const partyName = `Admin ${token}`;
    const partyId = await seed.account(partyName);
    const clientId = await seed.bill(partyId, 12_300);
    for (let i = 1; i < bills; i++) await seed.bill(partyId, 12_300);
    return { partyId, partyName, clientId };
  },
});

/** For the UC-09 e2e: each account's stored bills (removed ones too), its count and merge. */
export const partyBills = internalQuery({
  args: { ids: v.array(v.id("parties")) },
  returns: v.array(
    v.object({
      id: v.id("parties"),
      bills: v.number(),
      billCount: v.number(),
      mergedIntoId: v.union(v.id("parties"), v.null()),
    }),
  ),
  handler: async (ctx, { ids }) => {
    const out = [];
    for (const id of ids) {
      const party = await ctx.db.get(id);
      if (!party) throw appError("NOT_FOUND");
      const bills = await ctx.db
        .query("transactions")
        .withIndex("by_shop_party_date", (q) => q.eq("shopId", party.shopId).eq("partyId", id))
        .take(1000);
      out.push({
        id,
        bills: bills.length,
        billCount: party.billCount,
        mergedIntoId: party.mergedIntoId ?? null,
      });
    }
    return out;
  },
});
