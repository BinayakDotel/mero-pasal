import { deriveNames } from "@mero-pasal/shared/names";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { appError } from "./lib/errors";
import { adminQuery, ownerMutation } from "./lib/functions";
import { partyKind } from "./schema";

// F-12 accounts: edit, archive, and (next) merge. Names are derived the same way as when Buwa
// adds them (parties.create), so search keeps working.

const MAX_PARTIES = 2000;
const MAX_NAME = 80;
const MAX_FIELD = 40;

/** Every account for the admin table, incl. archived and merged ones (flagged). */
export const list = adminQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("parties"),
      kind: partyKind,
      displayName: v.string(),
      nameLatin: v.string(),
      nameDevanagari: v.optional(v.string()),
      tag: v.optional(v.string()),
      phone: v.optional(v.string()),
      pan: v.optional(v.string()),
      isWalkIn: v.boolean(),
      archived: v.boolean(),
      mergedIntoId: v.optional(v.id("parties")),
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
      ...(p.tag === undefined ? {} : { tag: p.tag }),
      ...(p.phone === undefined ? {} : { phone: p.phone }),
      ...(p.pan === undefined ? {} : { pan: p.pan }),
      isWalkIn: p.isWalkIn,
      archived: p.archived,
      ...(p.mergedIntoId === undefined ? {} : { mergedIntoId: p.mergedIntoId }),
      billCount: p.billCount,
      salePaisa: p.salePaisa,
      purchasePaisa: p.purchasePaisa,
      ...(p.lastBillDateBs === undefined ? {} : { lastBillDateBs: p.lastBillDateBs }),
    }));
  },
});

/** An account of the caller's shop that can still be changed (not the walk-in, not merged). */
async function editable(ctx: MutationCtx & { shopId: Id<"shops"> }, id: Id<"parties">) {
  const party = await ctx.db.get(id);
  if (!party || party.shopId !== ctx.shopId) throw appError("NOT_FOUND");
  if (party.isWalkIn) throw appError("VALIDATION", "The walk-in account can't be changed");
  if (party.mergedIntoId) throw appError("CONFLICT", "This account was merged");
  return party;
}

/** "" clears an optional field; too long → VALIDATION. */
function field(value: string | undefined, label: string): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > MAX_FIELD) throw appError("VALIDATION", `${label} is too long`);
  return text;
}

/**
 * F-12 edit: the name (Latin, Devanagari and phonetic forms recomputed from it), tag, phone,
 * PAN and kind, as full values. Owner or admin (architecture §10).
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
      tag: field(args.tag, "Tag"),
      phone: field(args.phone, "Phone"),
      pan: field(args.pan, "PAN"),
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
