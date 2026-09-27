import { deriveNames, findSimilar } from "@mero-pasal/shared/names";
import { v } from "convex/values";
import { writeAudit } from "./lib/audit";
import { appError } from "./lib/errors";
import { memberMutation, memberQuery } from "./lib/functions";
import { assertMonthBs } from "./lib/months";
import { partyKind } from "./schema";

// F-04 name picker backend. Search itself runs on the phone over `listForPicker` (ADR-012);
// the server derives the Latin form and phonetic key so every device agrees.

const MAX_PARTIES = 2000; // ADR-012: revisit above ~5,000
const MAX_CLIENT_ID = 64;
const MAX_NAME = 80;

const pickerParty = v.object({
  _id: v.id("parties"),
  clientId: v.string(),
  kind: partyKind,
  displayName: v.string(),
  tag: v.optional(v.string()),
  phoneticKey: v.string(),
  isWalkIn: v.boolean(),
  lastUsedAt: v.number(),
  lastBillDateBs: v.optional(v.string()),
  lastBillPaisa: v.optional(v.number()),
});

/** F-04: every usable account for the picker, most recently used first (trimmed fields). */
export const listForPicker = memberQuery({
  args: {},
  returns: v.array(pickerParty),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("parties")
      .withIndex("by_shop_lastUsed", (q) => q.eq("shopId", ctx.shopId))
      .order("desc")
      .take(MAX_PARTIES);
    return rows
      .filter((p) => !p.archived && p.mergedIntoId === undefined)
      .map((p) => ({
        _id: p._id,
        clientId: p.clientId,
        kind: p.kind,
        displayName: p.displayName,
        ...(p.tag === undefined ? {} : { tag: p.tag }),
        phoneticKey: p.phoneticKey,
        isWalkIn: p.isWalkIn,
        lastUsedAt: p.lastUsedAt,
        ...(p.lastBillDateBs === undefined ? {} : { lastBillDateBs: p.lastBillDateBs }),
        ...(p.lastBillPaisa === undefined ? {} : { lastBillPaisa: p.lastBillPaisa }),
      }));
  },
});

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * F-04 quick create. Idempotent by `clientId` (architecture §5.3 invariant 2): a retry from the
 * phone returns the account it already made. The kind comes from the bill type.
 */
export const create = memberMutation({
  args: {
    clientId: v.string(),
    name: v.string(),
    kind: v.union(v.literal("customer"), v.literal("supplier")),
    phone: v.optional(v.string()),
    tag: v.optional(v.string()),
  },
  returns: v.id("parties"),
  handler: async (ctx, { clientId, name, kind, phone, tag }) => {
    if (clientId === "" || clientId.length > MAX_CLIENT_ID) {
      throw appError("VALIDATION", "clientId must be 1–64 characters");
    }
    const existing = await ctx.db
      .query("parties")
      .withIndex("by_shop_clientId", (q) => q.eq("shopId", ctx.shopId).eq("clientId", clientId))
      .unique();
    if (existing) return existing._id;

    const names = deriveNames(name);
    if (names.displayName === "" || names.phoneticKey === "") {
      throw appError("VALIDATION", "A name with at least one letter is required");
    }
    if (names.displayName.length > MAX_NAME) throw appError("VALIDATION", "Name is too long");

    const now = Date.now();
    const cleanPhone = cleanOptional(phone);
    const cleanTag = cleanOptional(tag);
    const id = await ctx.db.insert("parties", {
      shopId: ctx.shopId,
      clientId,
      kind,
      displayName: names.displayName,
      nameLatin: names.nameLatin,
      ...(names.nameDevanagari === undefined ? {} : { nameDevanagari: names.nameDevanagari }),
      phoneticKey: names.phoneticKey,
      ...(cleanPhone === undefined ? {} : { phone: cleanPhone }),
      ...(cleanTag === undefined ? {} : { tag: cleanTag }),
      isWalkIn: false,
      archived: false,
      lastUsedAt: now,
      billCount: 0,
      salePaisa: 0,
      purchasePaisa: 0,
      balancePaisa: 0,
      createdBy: ctx.member._id,
      createdAt: now,
    });
    await writeAudit(ctx, {
      shopId: ctx.shopId,
      actorId: ctx.member._id,
      action: "party.create",
      entity: "party",
      entityId: id,
      summary: `${names.displayName} (${kind})`,
    });
    return id;
  },
});

/** F-04 "उही हो?": the online double-check for names close to a new one (up to 3). */
export const similar = memberQuery({
  args: { name: v.string() },
  returns: v.array(
    v.object({ _id: v.id("parties"), displayName: v.string(), tag: v.optional(v.string()) }),
  ),
  handler: async (ctx, { name }) => {
    const rows = await ctx.db
      .query("parties")
      .withIndex("by_shop_lastUsed", (q) => q.eq("shopId", ctx.shopId))
      .order("desc")
      .take(MAX_PARTIES);
    const usable = rows.filter((p) => !p.archived && p.mergedIntoId === undefined && !p.isWalkIn);
    return findSimilar(name, usable).map((p) => ({
      _id: p._id,
      displayName: p.displayName,
      ...(p.tag === undefined ? {} : { tag: p.tag }),
    }));
  },
});

const totals = v.object({
  billCount: v.number(),
  salePaisa: v.number(),
  purchasePaisa: v.number(),
});

/**
 * F-07 account page header: the account, its all-time totals and one BS month's totals.
 * A merged account reports where it went, so the page can follow it.
 */
export const get = memberQuery({
  args: { id: v.id("parties"), monthBs: v.string() },
  returns: v.object({
    _id: v.id("parties"),
    kind: partyKind,
    displayName: v.string(),
    nameLatin: v.string(),
    nameDevanagari: v.optional(v.string()),
    tag: v.optional(v.string()),
    phone: v.optional(v.string()),
    isWalkIn: v.boolean(),
    archived: v.boolean(),
    mergedIntoId: v.optional(v.id("parties")),
    allTime: totals,
    month: totals,
    firstBillDateBs: v.optional(v.string()),
    lastBillDateBs: v.optional(v.string()),
    createdAt: v.number(),
    /** The owner or admin may edit it (ADR-036); never the walk-in or a merged account. */
    canEdit: v.boolean(),
  }),
  handler: async (ctx, { id, monthBs }) => {
    assertMonthBs(monthBs);
    const party = await ctx.db.get(id);
    if (!party || party.shopId !== ctx.shopId) throw appError("NOT_FOUND");
    const month = await ctx.db
      .query("partyMonthly")
      .withIndex("by_party_month", (q) => q.eq("partyId", id).eq("monthBs", monthBs))
      .unique();
    // The oldest active bill (removed ones don't count); lastBillDateBs is kept by ledger.apply.
    const first = party.billCount
      ? await ctx.db
          .query("transactions")
          .withIndex("by_shop_party_date", (q) => q.eq("shopId", ctx.shopId).eq("partyId", id))
          .filter((q) => q.eq(q.field("status"), "active"))
          .first()
      : null;
    const canEdit =
      ctx.member.role !== "staff" &&
      !party.isWalkIn &&
      party.mergedIntoId === undefined &&
      party.mergingInto === undefined;
    return {
      _id: party._id,
      kind: party.kind,
      displayName: party.displayName,
      nameLatin: party.nameLatin,
      ...(party.nameDevanagari === undefined ? {} : { nameDevanagari: party.nameDevanagari }),
      ...(party.tag === undefined ? {} : { tag: party.tag }),
      ...(party.phone === undefined ? {} : { phone: party.phone }),
      isWalkIn: party.isWalkIn,
      archived: party.archived,
      ...(party.mergedIntoId === undefined ? {} : { mergedIntoId: party.mergedIntoId }),
      allTime: {
        billCount: party.billCount,
        salePaisa: party.salePaisa,
        purchasePaisa: party.purchasePaisa,
      },
      month: {
        billCount: month?.billCount ?? 0,
        salePaisa: month?.salePaisa ?? 0,
        purchasePaisa: month?.purchasePaisa ?? 0,
      },
      ...(first ? { firstBillDateBs: first.dateBs } : {}),
      ...(party.lastBillDateBs === undefined ? {} : { lastBillDateBs: party.lastBillDateBs }),
      createdAt: party.createdAt,
      canEdit,
    };
  },
});

/** F-07 accounts list: every account's totals for one BS month (accounts without bills omitted). */
export const monthTotals = memberQuery({
  args: { monthBs: v.string() },
  returns: v.array(
    v.object({
      partyId: v.id("parties"),
      billCount: v.number(),
      salePaisa: v.number(),
      purchasePaisa: v.number(),
    }),
  ),
  handler: async (ctx, { monthBs }) => {
    assertMonthBs(monthBs);
    const rows = await ctx.db
      .query("partyMonthly")
      .withIndex("by_shop_month", (q) => q.eq("shopId", ctx.shopId).eq("monthBs", monthBs))
      .take(MAX_PARTIES);
    return rows
      .filter((r) => r.billCount > 0)
      .map(({ partyId, billCount, salePaisa, purchasePaisa }) => ({
        partyId,
        billCount,
        salePaisa,
        purchasePaisa,
      }));
  },
});
