import { bsToAdMs, diffDaysBs, isValidBs, todayBs } from "@mero-pasal/shared/dates";
import { MAX_BILL_PAGES, MAX_FUTURE_DAYS } from "@mero-pasal/shared/domain";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { appError } from "./lib/errors";
import { memberMutation, memberQuery } from "./lib/functions";
import { apply } from "./lib/ledger";

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
  returns: v.array(
    v.object({
      _id: v.id("transactions"),
      clientId: v.string(),
      kind: v.union(v.literal("sale"), v.literal("purchase")),
      partyName: v.optional(v.string()),
      isWalkIn: v.boolean(),
      amountPaisa: v.optional(v.number()),
      capturedAt: v.number(),
      thumbUrl: v.union(v.string(), v.null()),
    }),
  ),
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
    return Promise.all(
      rows
        .filter(
          (row): row is typeof row & { kind: "sale" | "purchase" } =>
            row.kind === "sale" || row.kind === "purchase",
        )
        .map(async (row) => {
          const party = row.partyId ? await ctx.db.get(row.partyId) : null;
          const first = row.photos[0];
          return {
            _id: row._id,
            clientId: row.clientId,
            kind: row.kind,
            ...(party ? { partyName: party.displayName } : {}),
            isWalkIn: party?.isWalkIn ?? false,
            ...(row.amountPaisa === undefined ? {} : { amountPaisa: row.amountPaisa }),
            capturedAt: row.clientCapturedAt ?? row.capturedAt,
            thumbUrl: first ? await ctx.storage.getUrl(first.thumbId) : null,
          };
        }),
    );
  },
});
