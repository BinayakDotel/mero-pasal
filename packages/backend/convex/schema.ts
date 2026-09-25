import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Architecture §5.2. Tables and fields for v1.1/v2 are here now so no migration is needed later;
// unused fields stay undefined. Literal lists must match @mero-pasal/shared/domain (tested).

export const role = v.union(v.literal("owner"), v.literal("admin"), v.literal("staff"));
export const locale = v.union(v.literal("ne"), v.literal("en"));
export const txKind = v.union(
  v.literal("sale"),
  v.literal("purchase"), // v1.0
  v.literal("payment_in"),
  v.literal("payment_out"), // v1.1
  v.literal("opening_balance"),
  v.literal("adjustment"), // v1.1
);
export const paymentMode = v.union(
  v.literal("cash"),
  v.literal("qr"),
  v.literal("credit"),
  v.literal("mixed"),
);
export const partyKind = v.union(v.literal("customer"), v.literal("supplier"), v.literal("both"));

const photo = v.object({
  storageId: v.id("_storage"), // full image, ≤1600px JPEG
  thumbId: v.id("_storage"), // 320px thumbnail
  width: v.number(),
  height: v.number(),
  bytes: v.number(),
});

export default defineSchema({
  shops: defineTable({
    name: v.string(),
    nameNe: v.optional(v.string()),
    pan: v.optional(v.string()),
    address: v.optional(v.string()),
    createdAt: v.number(),
  }),

  members: defineTable({
    shopId: v.id("shops"),
    // identity.subject. Absent on an invite nobody has claimed yet (F-13, ADR-034): such a row
    // matches no signed-in user until `members.claimInvite` links it.
    clerkUserId: v.optional(v.string()),
    email: v.optional(v.string()), // trimmed + lowercased; how an invite is claimed
    invitedAt: v.optional(v.number()),
    invitedBy: v.optional(v.id("members")),
    displayName: v.string(),
    role,
    locale,
    active: v.boolean(),
    // Superseded by `memberSync` (M2): writing here re-ran every live member query. Unused.
    lastSeenAt: v.optional(v.number()),
    lastSyncAt: v.optional(v.number()),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_shop", ["shopId"])
    .index("by_email", ["email"]),

  parties: defineTable({
    shopId: v.id("shops"),
    clientId: v.string(),
    kind: partyKind,
    displayName: v.string(), // as typed
    nameLatin: v.string(), // derived, admin-editable
    nameDevanagari: v.optional(v.string()),
    phoneticKey: v.string(), // shared/names.phoneticKey()
    phone: v.optional(v.string()),
    pan: v.optional(v.string()),
    tag: v.optional(v.string()), // "चोक", "driver": tells people apart
    isWalkIn: v.boolean(),
    archived: v.boolean(),
    mergedIntoId: v.optional(v.id("parties")),
    lastUsedAt: v.number(),
    // F-04 picker line "हिजो · रु 2,340": the latest active bill (by date). Kept by ledger.apply;
    // undefined until the account has a bill. The amount is absent when that bill has none.
    lastBillDateBs: v.optional(v.string()),
    lastBillPaisa: v.optional(v.number()),
    billCount: v.number(), // denormalised all-time
    salePaisa: v.number(),
    purchasePaisa: v.number(),
    balancePaisa: v.number(), // v1.1: + they owe us, − we owe them
    createdBy: v.id("members"),
    createdAt: v.number(),
  })
    .index("by_shop_lastUsed", ["shopId", "lastUsedAt"])
    .index("by_shop_clientId", ["shopId", "clientId"])
    .index("by_shop_phoneticKey", ["shopId", "phoneticKey"])
    .index("by_shop_pan", ["shopId", "pan"]),

  transactions: defineTable({
    shopId: v.id("shops"),
    clientId: v.string(),
    kind: txKind,
    partyId: v.optional(v.id("parties")),
    dateBs: v.string(), // "YYYY-MM-DD", zero-padded
    dateAd: v.number(), // ms at 00:00 NPT of dateBs
    amountPaisa: v.optional(v.number()), // integer; undefined = not entered
    paymentMode: v.optional(paymentMode), // v1.1
    creditPaisa: v.optional(v.number()), // v1.1: part that moves the balance
    billNumber: v.optional(v.string()),
    note: v.optional(v.string()),
    photos: v.array(photo),
    status: v.union(v.literal("active"), v.literal("deleted")),
    deletedReason: v.optional(v.string()),
    needsAttention: v.boolean(), // no amount OR no party (sale/purchase)
    capturedAt: v.number(), // server clock at create (the record)
    clientCapturedAt: v.optional(v.number()), // M2: phone clock when taken; ordering only
    createdBy: v.id("members"),
    updatedAt: v.number(),
  })
    .index("by_shop_clientId", ["shopId", "clientId"])
    .index("by_shop_status_date", ["shopId", "status", "dateBs"])
    .index("by_shop_status_kind_date", ["shopId", "status", "kind", "dateBs"])
    .index("by_shop_party_date", ["shopId", "partyId", "dateBs"])
    // ADR-030: the latest *active* bill of an account in one read, however many were removed.
    .index("by_shop_party_status_date", ["shopId", "partyId", "status", "dateBs"])
    .index("by_shop_attention_date", ["shopId", "needsAttention", "dateBs"]),

  dailySummaries: defineTable({
    shopId: v.id("shops"),
    dateBs: v.string(),
    saleCount: v.number(),
    salePaisa: v.number(),
    purchaseCount: v.number(),
    purchasePaisa: v.number(),
    missingAmountCount: v.number(),
    creditGivenPaisa: v.optional(v.number()), // v1.1
    paymentInPaisa: v.optional(v.number()), // v1.1
    paymentOutPaisa: v.optional(v.number()), // v1.1
  }).index("by_shop_date", ["shopId", "dateBs"]),

  // Powers account lists and top-N reports.
  partyMonthly: defineTable({
    shopId: v.id("shops"),
    partyId: v.id("parties"),
    monthBs: v.string(), // "2083-06"
    billCount: v.number(),
    salePaisa: v.number(),
    purchasePaisa: v.number(),
  })
    .index("by_shop_month", ["shopId", "monthBs"])
    .index("by_party_month", ["partyId", "monthBs"]),

  // M2 / F-11, F-13: each member's device sync health, reported by members.heartbeat. Its own table
  // so heartbeats don't re-run every query that reads the member row.
  memberSync: defineTable({
    shopId: v.id("shops"),
    memberId: v.id("members"),
    lastSeenAt: v.number(),
    lastSyncAt: v.optional(v.number()), // last time the outbox fully drained
    pending: v.number(),
    failed: v.number(),
    oldestPendingAt: v.optional(v.number()),
    foreignPending: v.number(), // items left on this device by another account
  })
    .index("by_member", ["memberId"])
    .index("by_shop", ["shopId"]),

  // v1.1
  dayCloses: defineTable({
    shopId: v.id("shops"),
    dateBs: v.string(),
    totalSalesPaisa: v.number(),
    qrPaisa: v.number(),
    note: v.optional(v.string()),
    createdBy: v.id("members"),
    updatedAt: v.number(),
  }).index("by_shop_date", ["shopId", "dateBs"]),

  auditLog: defineTable({
    shopId: v.id("shops"),
    actorId: v.id("members"),
    action: v.string(), // "tx.create" | "tx.update" | "party.merge" | ...
    entity: v.union(
      v.literal("transaction"),
      v.literal("party"),
      v.literal("member"),
      v.literal("dayClose"),
    ),
    entityId: v.string(),
    summary: v.string(), // human-readable before → after
    at: v.number(),
  })
    .index("by_shop_at", ["shopId", "at"])
    .index("by_entity", ["entity", "entityId"]),
});
