import { bsToAdMs, diffDaysBs, isValidBs, todayBs } from "@mero-pasal/shared/dates";
import { MAX_BACKDATE_DAYS, MAX_BILL_PAGES, MAX_FUTURE_DAYS } from "@mero-pasal/shared/domain";
import { formatNpr } from "@mero-pasal/shared/money";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { billRow, isBill, toBillRow } from "./lib/billRow";
import { appError } from "./lib/errors";
import { adminMutation, memberMutation, memberQuery } from "./lib/functions";
import { apply } from "./lib/ledger";
import { assertMonthBs } from "./lib/months";
import { assertCanEdit } from "./lib/permissions";

const MAX_CLIENT_ID = 64;
const DAY_MS = 86_400_000;
/** Offline bills may sync days later; older phone times than this are treated as clock errors. */
const CLIENT_TIME_WINDOW_MS = 120 * DAY_MS;
const MAX_MERGE_HOPS = 10;

const photo = v.object({
  storageId: v.id("_storage"),
  thumbId: v.id("_storage"),
  width: v.number(),
  height: v.number(),
  bytes: v.number(),
});

/** F-04 / architecture §5.3 invariant 7: an account reference from the phone, merges followed. */
async function resolveParty(
  ctx: QueryCtx & { shopId: Id<"shops"> },
  ref: { id: Id<"parties"> } | { clientId: string },
): Promise<Doc<"parties">> {
  let party =
    "id" in ref
      ? await ctx.db.get(ref.id)
      : await ctx.db
          .query("parties")
          .withIndex("by_shop_clientId", (q) =>
            q.eq("shopId", ctx.shopId).eq("clientId", ref.clientId),
          )
          .unique();
  if (!party || party.shopId !== ctx.shopId) {
    // A name created on the phone syncs before its bill (architecture §8.2); if it hasn't yet,
    // the outbox retries this bill later.
    throw appError("CONFLICT", "Account not on the server yet");
  }
  for (let hop = 0; party.mergedIntoId !== undefined; hop++) {
    if (hop >= MAX_MERGE_HOPS) throw new Error("Account merge chain too long");
    const next: Doc<"parties"> | null = await ctx.db.get(party.mergedIntoId);
    if (!next || next.shopId !== ctx.shopId)
      throw appError("NOT_FOUND", "Merged account not found");
    party = next;
  }
  return party;
}

/**
 * F-03 save from the phone's outbox. Idempotent on (shop, clientId): a retry returns the bill it
 * already made and changes nothing (architecture §5.3 invariant 2). Writes via ledger.apply only.
 */
export const createFromClient = memberMutation({
  args: {
    clientId: v.string(),
    kind: v.union(v.literal("sale"), v.literal("purchase")),
    partyRef: v.optional(
      v.union(v.object({ id: v.id("parties") }), v.object({ clientId: v.string() })),
    ),
    dateBs: v.string(),
    amountPaisa: v.optional(v.number()),
    photos: v.array(photo),
    /** M2: phone clock when the photo was taken; used for ordering only, never trusted as a record. */
    clientCapturedAt: v.optional(v.number()),
  },
  returns: v.id("transactions"),
  handler: async (ctx, args) => {
    if (args.clientId === "" || args.clientId.length > MAX_CLIENT_ID) {
      throw appError("VALIDATION", "clientId must be 1–64 characters");
    }
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_shop_clientId", (q) =>
        q.eq("shopId", ctx.shopId).eq("clientId", args.clientId),
      )
      .unique();
    if (existing) return existing._id;

    // Architecture §5.3 invariant 6: a real BS date, at most one day ahead (the phone's clock
    // may be a little off; the server's NPT "today" decides).
    if (!isValidBs(args.dateBs))
      throw appError("VALIDATION", "dateBs must be a real YYYY-MM-DD BS date");
    if (diffDaysBs(todayBs(Date.now()), args.dateBs) > MAX_FUTURE_DAYS) {
      throw appError("VALIDATION", "A bill can't be dated in the future");
    }
    const amount = args.amountPaisa;
    if (amount !== undefined && (!Number.isSafeInteger(amount) || amount < 0)) {
      throw appError("VALIDATION", "amountPaisa must be a whole, non-negative number of paisa");
    }
    if (args.photos.length === 0 || args.photos.length > MAX_BILL_PAGES) {
      throw appError("VALIDATION", `A bill has 1–${MAX_BILL_PAGES} photos`);
    }
    for (const p of args.photos) {
      if (!(await ctx.db.system.get(p.storageId)) || !(await ctx.db.system.get(p.thumbId))) {
        throw appError("VALIDATION", "A photo was not uploaded");
      }
    }

    const party = args.partyRef ? await resolveParty(ctx, args.partyRef) : null;
    const now = Date.now();
    // A wrong phone clock must never block a bill: out-of-range times are simply dropped.
    const clientCapturedAt =
      args.clientCapturedAt !== undefined &&
      Number.isSafeInteger(args.clientCapturedAt) &&
      args.clientCapturedAt > now - CLIENT_TIME_WINDOW_MS &&
      args.clientCapturedAt < now + DAY_MS
        ? args.clientCapturedAt
        : undefined;
    return apply(
      ctx,
      null,
      {
        shopId: ctx.shopId,
        clientId: args.clientId,
        kind: args.kind,
        ...(party ? { partyId: party._id } : {}),
        dateBs: args.dateBs,
        dateAd: bsToAdMs(args.dateBs),
        ...(amount === undefined ? {} : { amountPaisa: amount }),
        photos: args.photos,
        status: "active",
        capturedAt: now,
        ...(clientCapturedAt === undefined ? {} : { clientCapturedAt }),
        createdBy: ctx.member._id,
      },
      {
        actorId: ctx.member._id,
        action: "tx.create",
        summary: `${args.kind} ${args.dateBs}${party ? ` · ${party.displayName}` : ""}${amount === undefined ? "" : ` · ${amount} paisa`}`,
      },
    );
  },
});

const MAX_RECENT = 10;
const RECENT_WINDOW = 50;

/** F-02 Today "recent bills": the newest active bills of one day, with thumbnail URLs only (F-06). */
export const listRecentForDate = memberQuery({
  args: { dateBs: v.string(), limit: v.optional(v.number()) },
  returns: v.array(billRow),
  handler: async (ctx, { dateBs, limit = 5 }) => {
    if (!isValidBs(dateBs))
      throw appError("VALIDATION", "dateBs must be a real YYYY-MM-DD BS date");
    const take = Math.min(Math.max(Math.trunc(limit), 1), MAX_RECENT);
    // Offline bills sync late, so insertion order isn't capture order: read a bounded window of
    // the newest rows and order by when each bill was taken.
    const window = await ctx.db
      .query("transactions")
      .withIndex("by_shop_status_date", (q) =>
        q.eq("shopId", ctx.shopId).eq("status", "active").eq("dateBs", dateBs),
      )
      .order("desc")
      .take(RECENT_WINDOW);
    const takenAt = (row: (typeof window)[number]) => row.clientCapturedAt ?? row.capturedAt;
    const rows = window.sort((a, b) => takenAt(b) - takenAt(a)).slice(0, take);
    return Promise.all(rows.filter(isBill).map((row) => toBillRow(ctx, row)));
  },
});

/** F-06 filter chips: सबै / बेचेको / किनेको / रकम छैन. */
const billFilter = v.union(
  v.literal("all"),
  v.literal("sale"),
  v.literal("purchase"),
  v.literal("noAmount"),
);

/**
 * F-06 Bills list: active bills newest date first, a page at a time, thumbnails only.
 * "रकम छैन" reads the needs-attention index (no amount or no name) and keeps the ones without an
 * amount; they're few, so short pages are fine.
 */
export const listByDate = memberQuery({
  args: { filter: billFilter, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(billRow),
  handler: async (ctx, { filter, paginationOpts }) => {
    const { shopId } = ctx;
    const base = ctx.db.query("transactions");
    const query =
      filter === "all"
        ? base.withIndex("by_shop_status_date", (q) =>
            q.eq("shopId", shopId).eq("status", "active"),
          )
        : filter === "noAmount"
          ? base
              .withIndex("by_shop_attention_date", (q) =>
                q.eq("shopId", shopId).eq("needsAttention", true),
              )
              .filter((q) => q.eq(q.field("amountPaisa"), undefined))
          : base.withIndex("by_shop_status_kind_date", (q) =>
              q.eq("shopId", shopId).eq("status", "active").eq("kind", filter),
            );
    const result = await query.order("desc").paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(result.page.filter(isBill).map((row) => toBillRow(ctx, row))),
    };
  },
});

/**
 * F-07 account page: one account's active bills, newest date first, a page at a time;
 * optionally one BS month only.
 */
export const listByParty = memberQuery({
  args: {
    partyId: v.id("parties"),
    monthBs: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(billRow),
  handler: async (ctx, { partyId, monthBs, paginationOpts }) => {
    if (monthBs !== undefined) assertMonthBs(monthBs);
    const party = await ctx.db.get(partyId);
    if (!party || party.shopId !== ctx.shopId) throw appError("NOT_FOUND");
    const result = await ctx.db
      .query("transactions")
      .withIndex("by_shop_party_status_date", (q) => {
        const account = q.eq("shopId", ctx.shopId).eq("partyId", partyId).eq("status", "active");
        // BS day numbers run 01–32, so "YYYY-MM-00" < every day of the month < "YYYY-MM-33".
        return monthBs === undefined
          ? account
          : account.gt("dateBs", `${monthBs}-00`).lt("dateBs", `${monthBs}-33`);
      })
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(result.page.filter(isBill).map((row) => toBillRow(ctx, row))),
    };
  },
});

/**
 * F-08 bill detail: full-size photo URLs (only here, never in lists), who saved it and when.
 * A removed bill is still returned with its status, so an open detail screen can say so.
 * Looked up by clientId: the phone knows it before the bill reaches the server (route
 * `/bills/[clientId]`); null while the bill is only on the phone.
 */
export const get = memberQuery({
  args: { clientId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("transactions"),
      clientId: v.string(),
      kind: v.union(v.literal("sale"), v.literal("purchase")),
      status: v.union(v.literal("active"), v.literal("deleted")),
      dateBs: v.string(),
      partyId: v.optional(v.id("parties")),
      partyName: v.optional(v.string()),
      isWalkIn: v.boolean(),
      amountPaisa: v.optional(v.number()),
      billNumber: v.optional(v.string()),
      capturedAt: v.number(),
      capturedBy: v.id("members"),
      capturedByName: v.string(),
      photos: v.array(
        v.object({
          url: v.union(v.string(), v.null()),
          thumbUrl: v.union(v.string(), v.null()),
          width: v.number(),
          height: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { clientId }) => {
    const row = await ctx.db
      .query("transactions")
      .withIndex("by_shop_clientId", (q) => q.eq("shopId", ctx.shopId).eq("clientId", clientId))
      .unique();
    if (!row || !isBill(row)) return null;
    const [base, author] = await Promise.all([toBillRow(ctx, row), ctx.db.get(row.createdBy)]);
    const photos = await Promise.all(
      row.photos.map(async (p) => ({
        url: await ctx.storage.getUrl(p.storageId),
        thumbUrl: await ctx.storage.getUrl(p.thumbId),
        width: p.width,
        height: p.height,
      })),
    );
    const { thumbUrl: _thumb, ...fields } = base;
    return {
      ...fields,
      status: row.status,
      ...(row.billNumber === undefined ? {} : { billNumber: row.billNumber }),
      capturedBy: row.createdBy,
      capturedByName: author?.displayName ?? "",
      photos,
    };
  },
});

const MAX_SEARCH_PARTIES = 5;
const MAX_SEARCH_BILLS = 50;

/**
 * F-06 search: the newest active bills of the accounts whose names matched on the phone
 * (ADR-012/029: names only), up to 5 accounts × 50 bills, newest first. No paging while searching.
 */
export const listForParties = memberQuery({
  args: { partyIds: v.array(v.id("parties")) },
  returns: v.array(billRow),
  handler: async (ctx, { partyIds }) => {
    if (partyIds.length > MAX_SEARCH_PARTIES) {
      throw appError("VALIDATION", `at most ${MAX_SEARCH_PARTIES} accounts`);
    }
    const perParty = await Promise.all(
      partyIds.map((partyId) =>
        ctx.db
          .query("transactions")
          .withIndex("by_shop_party_status_date", (q) =>
            q.eq("shopId", ctx.shopId).eq("partyId", partyId).eq("status", "active"),
          )
          .order("desc")
          .take(MAX_SEARCH_BILLS),
      ),
    );
    const rows = perParty
      .flat()
      .filter(isBill)
      .sort((a, b) => b.dateBs.localeCompare(a.dateBs) || b._creationTime - a._creationTime);
    return Promise.all(rows.map((row) => toBillRow(ctx, row)));
  },
});

/** A bill to correct or remove, by the clientId the phone knows (NOT_FOUND while unsent). */
async function billByClientId(ctx: QueryCtx & { shopId: Id<"shops"> }, clientId: string) {
  const row = await ctx.db
    .query("transactions")
    .withIndex("by_shop_clientId", (q) => q.eq("shopId", ctx.shopId).eq("clientId", clientId))
    .unique();
  if (!row || !isBill(row)) throw appError("NOT_FOUND", "Bill not on the server (yet)");
  return row;
}

/**
 * F-08 correct (UC-08): set the bill's type, account, amount and date to these values through
 * ledger.apply; photos never change. The phone sends the full new values, so a retry is a no-op
 * ("nothing changed") and applying twice can't double-count. Last write wins between devices.
 */
export const correct = memberMutation({
  args: {
    clientId: v.string(),
    kind: v.union(v.literal("sale"), v.literal("purchase")),
    partyRef: v.optional(
      v.union(v.object({ id: v.id("parties") }), v.object({ clientId: v.string() })),
    ),
    dateBs: v.string(),
    amountPaisa: v.optional(v.number()),
  },
  returns: v.id("transactions"),
  handler: async (ctx, args) => {
    const tx = await billByClientId(ctx, args.clientId);
    const now = Date.now();
    assertCanEdit(ctx.member, tx, now);
    if (tx.status === "deleted") throw appError("CONFLICT", "A removed bill can't be corrected");

    const amount = args.amountPaisa;
    if (amount !== undefined && (!Number.isSafeInteger(amount) || amount < 0)) {
      throw appError("VALIDATION", "amountPaisa must be a whole, non-negative number of paisa");
    }
    if (args.dateBs !== tx.dateBs) {
      // F-05: a new date is a real BS date, at most 90 days back and not in the future.
      if (!isValidBs(args.dateBs))
        throw appError("VALIDATION", "dateBs must be a real YYYY-MM-DD BS date");
      const ahead = diffDaysBs(todayBs(now), args.dateBs);
      if (ahead > MAX_FUTURE_DAYS || -ahead > MAX_BACKDATE_DAYS) {
        throw appError("VALIDATION", "Date must be within the last 90 days");
      }
    }
    const party = args.partyRef ? await resolveParty(ctx, args.partyRef) : null;
    const partyId = party?._id;
    if (
      args.kind === tx.kind &&
      partyId === tx.partyId &&
      amount === tx.amountPaisa &&
      args.dateBs === tx.dateBs
    ) {
      return tx._id; // already so (a retry, or nothing changed)
    }

    const {
      _id,
      _creationTime,
      needsAttention,
      updatedAt,
      partyId: _p,
      amountPaisa: _a,
      ...keep
    } = tx;
    const oldParty = tx.partyId ? await ctx.db.get(tx.partyId) : null;
    const money = (paisa: number | undefined) =>
      paisa === undefined ? "—" : formatNpr(paisa, { locale: "en" });
    const changes = [
      args.kind !== tx.kind && `type: ${tx.kind} → ${args.kind}`,
      partyId !== tx.partyId &&
        `account: ${oldParty?.displayName ?? "—"} → ${party?.displayName ?? "—"}`,
      amount !== tx.amountPaisa && `amount: ${money(tx.amountPaisa)} → ${money(amount)}`,
      args.dateBs !== tx.dateBs && `date: ${tx.dateBs} → ${args.dateBs}`,
    ].filter(Boolean);
    return apply(
      ctx,
      tx,
      {
        ...keep,
        kind: args.kind,
        ...(partyId === undefined ? {} : { partyId }),
        ...(amount === undefined ? {} : { amountPaisa: amount }),
        dateBs: args.dateBs,
        dateAd: bsToAdMs(args.dateBs),
      },
      { actorId: ctx.member._id, action: "tx.correct", summary: changes.join(" · ") },
    );
  },
});

/**
 * F-08 remove (UC-07): a soft delete through ledger.apply, so the bill leaves every list and
 * total (NFR-07: never a hard delete). Already removed → nothing to do (a retry is a no-op).
 * The app's 6 s Undo happens on the phone before this is sent; afterwards only admin restores.
 */
export const remove = memberMutation({
  args: { clientId: v.string() },
  returns: v.id("transactions"),
  handler: async (ctx, { clientId }) => {
    const tx = await billByClientId(ctx, clientId);
    assertCanEdit(ctx.member, tx, Date.now());
    if (tx.status === "deleted") return tx._id;
    const { _id, _creationTime, needsAttention, updatedAt, ...keep } = tx;
    return apply(
      ctx,
      tx,
      { ...keep, status: "deleted" },
      { actorId: ctx.member._id, action: "tx.remove", summary: "removed" },
    );
  },
});

/** F-08 / architecture §10.3: admin brings a removed bill back into lists and totals. */
export const restore = adminMutation({
  args: { clientId: v.string() },
  returns: v.id("transactions"),
  handler: async (ctx, { clientId }) => {
    const tx = await billByClientId(ctx, clientId);
    if (tx.status === "active") return tx._id;
    const { _id, _creationTime, needsAttention, updatedAt, deletedReason: _r, ...keep } = tx;
    return apply(
      ctx,
      tx,
      { ...keep, status: "active" },
      { actorId: ctx.member._id, action: "tx.restore", summary: "restored" },
    );
  },
});
