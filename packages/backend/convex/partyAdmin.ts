import { deriveNames } from "@mero-pasal/shared/names";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { appError } from "./lib/errors";
import { adminMutation, adminQuery, ownerMutation } from "./lib/functions";
import { apply } from "./lib/ledger";
import { DELETED_WITH_ACCOUNT, isDeleted } from "./lib/parties";
import { partyKind } from "./schema";

// F-12 accounts: edit, archive, merge and delete. Names are derived the same way as when Buwa
// adds them (parties.create), so search keeps working.

const MAX_PARTIES = 2000;
const MAX_NAME = 80;
const MAX_FIELD = 40;

/** Every account for the admin table, incl. archived, merged and deleted ones (flagged). */
export const list = adminQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("parties"),
      kind: partyKind,
      displayName: v.string(),
      nameLatin: v.string(),
      nameDevanagari: v.optional(v.string()),
      /** For the any-script search (shared searchParties). */
      phoneticKey: v.string(),
      lastUsedAt: v.number(),
      tag: v.optional(v.string()),
      phone: v.optional(v.string()),
      pan: v.optional(v.string()),
      isWalkIn: v.boolean(),
      archived: v.boolean(),
      mergedIntoId: v.optional(v.id("parties")),
      /** A merge is moving this account's bills (still running, or stuck: resume or stop it). */
      mergingInto: v.optional(v.id("parties")),
      /** ADR-037: its delete is still removing bills (running, or stuck: run it again). */
      deletingAt: v.optional(v.number()),
      deletedAt: v.optional(v.number()),
      billCount: v.number(),
      salePaisa: v.number(),
      purchasePaisa: v.number(),
      lastBillDateBs: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("parties")
      .withIndex("by_shop_lastUsed", (q) => q.eq("shopId", ctx.shopId))
      .order("desc")
      .take(MAX_PARTIES);
    return rows.map((p) => ({
      _id: p._id,
      kind: p.kind,
      displayName: p.displayName,
      nameLatin: p.nameLatin,
      ...(p.nameDevanagari === undefined ? {} : { nameDevanagari: p.nameDevanagari }),
      phoneticKey: p.phoneticKey,
      lastUsedAt: p.lastUsedAt,
      ...(p.tag === undefined ? {} : { tag: p.tag }),
      ...(p.phone === undefined ? {} : { phone: p.phone }),
      ...(p.pan === undefined ? {} : { pan: p.pan }),
      isWalkIn: p.isWalkIn,
      archived: p.archived,
      ...(p.mergedIntoId === undefined ? {} : { mergedIntoId: p.mergedIntoId }),
      ...(p.mergingInto === undefined ? {} : { mergingInto: p.mergingInto }),
      ...(p.deletingAt === undefined ? {} : { deletingAt: p.deletingAt }),
      ...(p.deletedAt === undefined ? {} : { deletedAt: p.deletedAt }),
      billCount: p.billCount,
      salePaisa: p.salePaisa,
      purchasePaisa: p.purchasePaisa,
      ...(p.lastBillDateBs === undefined ? {} : { lastBillDateBs: p.lastBillDateBs }),
    }));
  },
});

/**
 * An account of the caller's shop that can still be changed: not the walk-in, not merged or being
 * merged, not deleted or being deleted.
 */
async function editable(ctx: MutationCtx & { shopId: Id<"shops"> }, id: Id<"parties">) {
  const party = await ctx.db.get(id);
  if (!party || party.shopId !== ctx.shopId) throw appError("NOT_FOUND");
  if (party.isWalkIn) throw appError("VALIDATION", "The walk-in account can't be changed");
  if (party.mergedIntoId) throw appError("CONFLICT", "This account was merged");
  if (party.mergingInto) throw appError("CONFLICT", "This account is being merged");
  if (party.deletingAt !== undefined) throw appError("CONFLICT", "This account is being deleted");
  if (party.deletedAt !== undefined) throw appError("CONFLICT", "This account was deleted");
  return party;
}

/** Another merge is still moving bills into this account. */
async function isMergeTarget(ctx: MutationCtx & { shopId: Id<"shops"> }, id: Id<"parties">) {
  const all = await ctx.db
    .query("parties")
    .withIndex("by_shop_lastUsed", (q) => q.eq("shopId", ctx.shopId))
    .take(MAX_PARTIES);
  return all.some((p) => p.mergingInto === id);
}

/** "" clears an optional field; too long → VALIDATION. */
function field(value: string | undefined, label: string): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > MAX_FIELD) throw appError("VALIDATION", `${label} is too long`);
  return text;
}

/**
 * F-12 / F-07 edit: the name (Latin, Devanagari and phonetic forms recomputed from it) and kind;
 * tag, phone and PAN when given ("" clears; left out = unchanged, so the phone's edit sheet, which
 * has no PAN field, never erases one). Owner or admin (architecture §10, ADR-036).
 */
export const update = ownerMutation({
  args: {
    id: v.id("parties"),
    name: v.string(),
    kind: partyKind,
    tag: v.optional(v.string()),
    phone: v.optional(v.string()),
    pan: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const party = await editable(ctx, args.id);
    const names = deriveNames(args.name);
    if (names.displayName === "" || names.phoneticKey === "") {
      throw appError("VALIDATION", "A name with at least one letter is required");
    }
    if (names.displayName.length > MAX_NAME) throw appError("VALIDATION", "Name is too long");
    const next = {
      displayName: names.displayName,
      nameLatin: names.nameLatin,
      nameDevanagari: names.nameDevanagari,
      phoneticKey: names.phoneticKey,
      kind: args.kind,
      tag: args.tag === undefined ? party.tag : field(args.tag, "Tag"),
      phone: args.phone === undefined ? party.phone : field(args.phone, "Phone"),
      pan: args.pan === undefined ? party.pan : field(args.pan, "PAN"),
    };
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
      (k) => next[k] !== party[k],
    );
    if (changed.length === 0) return null;
    await ctx.db.patch(args.id, next);
    await writeAudit(ctx, {
      shopId: ctx.shopId,
      actorId: ctx.member._id,
      action: "party.update",
      entity: "party",
      entityId: args.id,
      summary:
        party.displayName === next.displayName
          ? `${next.displayName}: ${changed.join(", ")} changed`
          : `renamed: ${party.displayName} → ${next.displayName}`,
    });
    return null;
  },
});

/** F-12 archive (leaves the picker; its bills stay) or bring it back. Owner or admin. */
export const setArchived = ownerMutation({
  args: { id: v.id("parties"), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { id, archived }) => {
    const party = await editable(ctx, id);
    if (party.archived === archived) return null;
    await ctx.db.patch(id, { archived });
    await writeAudit(ctx, {
      shopId: ctx.shopId,
      actorId: ctx.member._id,
      action: archived ? "party.archive" : "party.unarchive",
      entity: "party",
      entityId: id,
      summary: `${party.displayName} ${archived ? "archived" : "brought back"}`,
    });
    return null;
  },
});

const MERGE_BATCH = 100;
const DELETE_BATCH = 100;
/** A delete started this recently is still running: running it again would only restart it. */
const DELETE_RUNNING_MS = 60_000;

/**
 * F-12 / UC-09 merge: every bill of `mergeId` moves to `keepId` through ledger.apply (so every
 * total stays equal to a recount), in batches that continue in the background; then `mergeId`
 * is marked merged. Nothing is deleted. Admin only.
 */
export const merge = adminMutation({
  args: { keepId: v.id("parties"), mergeId: v.id("parties") },
  returns: v.null(),
  handler: async (ctx, { keepId, mergeId }) => {
    if (keepId === mergeId) throw appError("VALIDATION", "Pick two different accounts");
    const keep = await editable(ctx, keepId);
    const gone = await editable(ctx, mergeId);
    // An account other merges are moving bills into can't itself be merged away meanwhile.
    if (await isMergeTarget(ctx, gone._id)) {
      throw appError("CONFLICT", "Another merge into this account is still running");
    }
    await ctx.db.patch(gone._id, { mergingInto: keep._id });
    await ctx.scheduler.runAfter(0, internal.partyAdmin.moveBatch, {
      keepId,
      mergeId,
      actorId: ctx.member._id,
      moved: 0,
      batch: MERGE_BATCH,
    });
    return null;
  },
});

/** The account being merged away, while its merge is in progress. */
async function merging(ctx: MutationCtx & { shopId: Id<"shops"> }, id: Id<"parties">) {
  const gone = await ctx.db.get(id);
  if (!gone || gone.shopId !== ctx.shopId) throw appError("NOT_FOUND");
  if (!gone.mergingInto) throw appError("VALIDATION", "This account isn't being merged");
  const keep = await ctx.db.get(gone.mergingInto);
  if (!keep) throw appError("NOT_FOUND");
  return { gone, keep };
}

/** Bills only ever move onto a live account (ledger.apply blocks active bills, not removed ones). */
function isMergedAway(party: { mergedIntoId?: Id<"parties"> }) {
  return party.mergedIntoId !== undefined;
}

/**
 * A merge whose batch failed (scheduled batches aren't retried, e.g. after totals drifted: run
 * rebuild.summaries first) continues from the bills still left. Safe even while a batch runs:
 * each batch takes only bills still on the account, and the last one finishes atomically.
 */
export const resumeMerge = adminMutation({
  args: { mergeId: v.id("parties") },
  returns: v.null(),
  handler: async (ctx, { mergeId }) => {
    const { gone, keep } = await merging(ctx, mergeId);
    if (isMergedAway(keep)) {
      throw appError("CONFLICT", `${keep.displayName} was merged away; stop this merge`);
    }
    await ctx.scheduler.runAfter(0, internal.partyAdmin.moveBatch, {
      keepId: keep._id,
      mergeId,
      actorId: ctx.member._id,
      moved: 0,
      batch: MERGE_BATCH,
      resumed: true,
    });
    await writeAudit(ctx, {
      shopId: ctx.shopId,
      actorId: ctx.member._id,
      action: "party.mergeResume",
      entity: "party",
      entityId: gone._id,
      summary: `${gone.displayName} → ${keep.displayName} resumed`,
    });
    return null;
  },
});

/**
 * Stop a merge: bills already moved stay on the kept account (each went through ledger.apply,
 * so every total is still right); the rest stay here, and the account is usable again.
 */
export const stopMerge = adminMutation({
  args: { mergeId: v.id("parties") },
  returns: v.null(),
  handler: async (ctx, { mergeId }) => {
    const { gone, keep } = await merging(ctx, mergeId);
    await ctx.db.patch(gone._id, { mergingInto: undefined });
    await writeAudit(ctx, {
      shopId: ctx.shopId,
      actorId: ctx.member._id,
      action: "party.mergeStop",
      entity: "party",
      entityId: gone._id,
      summary: `${gone.displayName} → ${keep.displayName} stopped; ${gone.billCount} bill${gone.billCount === 1 ? "" : "s"} left here`,
    });
    return null;
  },
});

/** One batch of a merge; the last one (fewer bills than a batch) finishes it atomically. */
export const moveBatch = internalMutation({
  args: {
    keepId: v.id("parties"),
    mergeId: v.id("parties"),
    actorId: v.id("members"),
    moved: v.number(),
    batch: v.number(),
    /** A resumed merge counts only the bills this run moves. */
    resumed: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const keep = await ctx.db.get(args.keepId);
    const gone = await ctx.db.get(args.mergeId);
    if (!keep || !gone || gone.mergingInto !== keep._id) return null; // cancelled or finished
    if (isMergedAway(keep)) return null; // stuck until the admin stops it (resume refuses)
    const shop = { ...ctx, shopId: gone.shopId };
    const bills = await ctx.db
      .query("transactions")
      .withIndex("by_shop_party_date", (q) => q.eq("shopId", gone.shopId).eq("partyId", gone._id))
      .take(args.batch);
    for (const tx of bills) {
      const { _id, _creationTime, needsAttention, updatedAt, deletedReason, ...rest } = tx;
      // A bill an earlier delete removed stays removed, as an ordinary removed bill: bringing the
      // kept account back must not restore it.
      const reason = deletedReason === DELETED_WITH_ACCOUNT ? undefined : deletedReason;
      await apply(
        shop,
        tx,
        { ...rest, ...(reason === undefined ? {} : { deletedReason: reason }), partyId: keep._id },
        {
          actorId: args.actorId,
          action: "tx.move",
          summary: `account: ${gone.displayName} → ${keep.displayName} (merge)`,
        },
      );
    }
    const moved = args.moved + bills.length;
    if (bills.length === args.batch) {
      await ctx.scheduler.runAfter(0, internal.partyAdmin.moveBatch, { ...args, moved });
      return null;
    }
    // Done: no bill left on the merged account, in this same transaction.
    await ctx.db.patch(gone._id, { mergedIntoId: keep._id, mergingInto: undefined });
    await ctx.db.patch(keep._id, {
      ...(keep.kind !== gone.kind ? { kind: "both" as const } : {}),
      ...(keep.phone === undefined && gone.phone ? { phone: gone.phone } : {}),
      ...(keep.tag === undefined && gone.tag ? { tag: gone.tag } : {}),
    });
    await writeAudit(ctx, {
      shopId: gone.shopId,
      actorId: args.actorId,
      action: "party.merge",
      entity: "party",
      entityId: keep._id,
      summary: args.resumed
        ? `${gone.displayName} → ${keep.displayName} (resumed), ${moved} more bill${moved === 1 ? "" : "s"}`
        : `${gone.displayName} → ${keep.displayName}, ${moved} bill${moved === 1 ? "" : "s"}`,
    });
    return null;
  },
});

const bills = (n: number) => `${n} bill${n === 1 ? "" : "s"}`;

/**
 * F-12 delete (ADR-037): every active bill of the account is removed through ledger.apply (so
 * every total stays equal to a recount), in batches that continue in the background; then the
 * account is marked deleted and leaves every list. Nothing is hard-deleted, and bringing it back
 * restores exactly these bills. Running it again while a delete is stuck (a minute on) continues
 * it (a new run; the old one stops at its next batch). Admin only.
 */
export const deleteAccount = adminMutation({
  args: { id: v.id("parties") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const party = await ctx.db.get(id);
    if (!party || party.shopId !== ctx.shopId) throw appError("NOT_FOUND");
    if (party.deletedAt !== undefined) return null; // already deleted: a retry
    if (party.isWalkIn) throw appError("VALIDATION", "The walk-in account can't be deleted");
    if (party.mergedIntoId) throw appError("CONFLICT", "This account was merged");
    if (party.mergingInto) throw appError("CONFLICT", "This account is being merged");
    if (await isMergeTarget(ctx, id)) {
      throw appError("CONFLICT", "A merge into this account is still running");
    }
    const now = Date.now();
    // A double click, or Retry right after Delete: that run is still going.
    if (party.deletingAt !== undefined && now - party.deletingAt < DELETE_RUNNING_MS) return null;
    const retried = party.deletingAt !== undefined;
    // Each run has its own mark, so an older run still scheduled stops instead of finishing twice.
    const run = Math.max(now, (party.deletingAt ?? 0) + 1);
    await ctx.db.patch(id, { deletingAt: run });
    await ctx.scheduler.runAfter(0, internal.partyAdmin.deleteBatch, {
      partyId: id,
      actorId: ctx.member._id,
      run,
      removed: 0,
      batch: DELETE_BATCH,
      ...(retried ? { retried } : {}),
    });
    if (retried) {
      await writeAudit(ctx, {
        shopId: ctx.shopId,
        actorId: ctx.member._id,
        action: "party.deleteRetry",
        entity: "party",
        entityId: id,
        summary: `${party.displayName}: delete continued`,
      });
    }
    return null;
  },
});

/** One batch of a delete; the last one (fewer bills than a batch) marks the account deleted. */
export const deleteBatch = internalMutation({
  args: {
    partyId: v.id("parties"),
    actorId: v.id("members"),
    run: v.number(),
    removed: v.number(),
    batch: v.number(),
    /** A continued delete counts only the bills this run removes. */
    retried: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const party = await ctx.db.get(args.partyId);
    // Brought back (a bill landed on it, or the admin), or a newer run took over.
    if (!party || party.deletingAt !== args.run) return null;
    const shop = { ...ctx, shopId: party.shopId };
    const active = await ctx.db
      .query("transactions")
      .withIndex("by_shop_party_status_date", (q) =>
        q.eq("shopId", party.shopId).eq("partyId", party._id).eq("status", "active"),
      )
      .take(args.batch);
    for (const tx of active) {
      const { _id, _creationTime, needsAttention, updatedAt, ...rest } = tx;
      await apply(
        shop,
        tx,
        { ...rest, status: "deleted", deletedReason: DELETED_WITH_ACCOUNT },
        {
          actorId: args.actorId,
          action: "tx.remove",
          summary: `removed with its account ${party.displayName}`,
        },
      );
    }
    const removed = args.removed + active.length;
    if (active.length === args.batch) {
      await ctx.scheduler.runAfter(0, internal.partyAdmin.deleteBatch, { ...args, removed });
      return null;
    }
    // Done: no active bill left on the account, in this same transaction.
    await ctx.db.patch(party._id, {
      deletingAt: undefined,
      deletedAt: Date.now(),
      deletedBy: args.actorId,
    });
    await writeAudit(ctx, {
      shopId: party.shopId,
      actorId: args.actorId,
      action: "party.delete",
      entity: "party",
      entityId: party._id,
      summary: args.retried
        ? `${party.displayName} deleted (continued), ${removed} more bill${removed === 1 ? "" : "s"} removed`
        : `${party.displayName} deleted, ${bills(removed)} removed`,
    });
    return null;
  },
});

/**
 * F-12 bring back (ADR-037): the account returns at once (a delete still running stops), then the
 * bills its delete removed come back in batches. Bills removed one by one stay removed. Also
 * finishes the job after a bill brought the account back on its own. Admin only.
 */
export const restoreAccount = adminMutation({
  args: { id: v.id("parties") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const party = await ctx.db.get(id);
    if (!party || party.shopId !== ctx.shopId) throw appError("NOT_FOUND");
    if (party.mergedIntoId) throw appError("CONFLICT", "This account was merged");
    if (party.mergingInto) throw appError("CONFLICT", "This account is being merged");
    if (isDeleted(party)) {
      await ctx.db.patch(id, { deletedAt: undefined, deletedBy: undefined, deletingAt: undefined });
      await writeAudit(ctx, {
        shopId: ctx.shopId,
        actorId: ctx.member._id,
        action: "party.undelete",
        entity: "party",
        entityId: id,
        summary: `${party.displayName} brought back`,
      });
    }
    await ctx.scheduler.runAfter(0, internal.partyAdmin.restoreBatch, {
      partyId: id,
      actorId: ctx.member._id,
      restored: 0,
      batch: DELETE_BATCH,
    });
    return null;
  },
});

/** Bills of this account that its delete removed, oldest first. */
function removedWithAccount(ctx: QueryCtx, party: Doc<"parties">) {
  return ctx.db
    .query("transactions")
    .withIndex("by_shop_party_status_date", (q) =>
      q.eq("shopId", party.shopId).eq("partyId", party._id).eq("status", "deleted"),
    )
    .filter((q) => q.eq(q.field("deletedReason"), DELETED_WITH_ACCOUNT));
}

/** One batch of bringing an account's bills back; the last one writes the history entry. */
export const restoreBatch = internalMutation({
  args: {
    partyId: v.id("parties"),
    actorId: v.id("members"),
    restored: v.number(),
    batch: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const party = await ctx.db.get(args.partyId);
    // Deleted again meanwhile: that delete wins (its bills would only be removed again).
    if (!party || party.deletingAt !== undefined || party.deletedAt !== undefined) return null;
    const shop = { ...ctx, shopId: party.shopId };
    const removed = await removedWithAccount(ctx, party).take(args.batch);
    for (const tx of removed) {
      const { _id, _creationTime, needsAttention, updatedAt, deletedReason: _r, ...rest } = tx;
      await apply(
        shop,
        tx,
        { ...rest, status: "active" },
        { actorId: args.actorId, action: "tx.restore", summary: "restored with its account" },
      );
    }
    const restored = args.restored + removed.length;
    if (removed.length === args.batch) {
      await ctx.scheduler.runAfter(0, internal.partyAdmin.restoreBatch, { ...args, restored });
      return null;
    }
    await writeAudit(ctx, {
      shopId: party.shopId,
      actorId: args.actorId,
      action: "party.restore",
      entity: "party",
      entityId: party._id,
      summary: `${bills(restored)} restored with ${party.displayName}`,
    });
    return null;
  },
});

const MAX_REMOVED_COUNT = 5000;

/** F-12: how many of this account's bills its delete removed (what "Bring back" restores). */
export const removedWithAccountCount = adminQuery({
  args: { id: v.id("parties") },
  returns: v.number(),
  handler: async (ctx, { id }) => {
    const party = await ctx.db.get(id);
    if (!party || party.shopId !== ctx.shopId) throw appError("NOT_FOUND");
    return (await removedWithAccount(ctx, party).take(MAX_REMOVED_COUNT)).length;
  },
});

/** Phone numbers compare by their digits (last 10), so "+977-9841…" and "9841…" match. */
function phoneKey(phone: string | undefined): string | undefined {
  const digits = phone?.replace(/\D/g, "").slice(-10);
  return digits && digits.length >= 7 ? digits : undefined;
}

/**
 * F-11 / F-12 / UC-09: pairs of accounts that are probably the same person: the same phonetic
 * key (e.g. "Ram Bdr Thapa" / "राम बहादुर थापा") or the same phone. Suggests keeping the one
 * with more bills. The walk-in, archived, merged, merging and deleted accounts are left out.
 */
export const duplicates = adminQuery({
  args: {},
  returns: v.array(
    v.object({
      keepId: v.id("parties"),
      keepName: v.string(),
      keepBills: v.number(),
      mergeId: v.id("parties"),
      mergeName: v.string(),
      mergeBills: v.number(),
      reason: v.union(v.literal("name"), v.literal("phone")),
    }),
  ),
  handler: async (ctx) => {
    const usable = (
      await ctx.db
        .query("parties")
        .withIndex("by_shop_lastUsed", (q) => q.eq("shopId", ctx.shopId))
        .take(MAX_PARTIES)
    ).filter(
      (p) => !p.isWalkIn && !p.archived && !p.mergedIntoId && !p.mergingInto && !isDeleted(p),
    );
    const pairs = new Map<
      string,
      { a: (typeof usable)[number]; b: (typeof usable)[number]; reason: "name" | "phone" }
    >();
    const group = (
      key: (p: (typeof usable)[number]) => string | undefined,
      reason: "name" | "phone",
    ) => {
      const byKey = new Map<string, (typeof usable)[number][]>();
      for (const p of usable) {
        const k = key(p);
        if (k) byKey.set(k, [...(byKey.get(k) ?? []), p]);
      }
      for (const same of byKey.values()) {
        for (let i = 0; i < same.length; i++) {
          for (let j = i + 1; j < same.length; j++) {
            const [a, b] = [same[i], same[j]];
            if (!a || !b) continue;
            const id = [a._id, b._id].sort().join("|");
            if (!pairs.has(id)) pairs.set(id, { a, b, reason });
          }
        }
      }
    };
    group((p) => p.phoneticKey, "name");
    group((p) => phoneKey(p.phone), "phone");
    return [...pairs.values()].map(({ a, b, reason }) => {
      const [keep, gone] = a.billCount >= b.billCount ? [a, b] : [b, a];
      return {
        keepId: keep._id,
        keepName: keep.displayName,
        keepBills: keep.billCount,
        mergeId: gone._id,
        mergeName: gone.displayName,
        mergeBills: gone.billCount,
        reason,
      };
    });
  },
});
