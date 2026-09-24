import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// One bill in a list (Today, Bills, an account): thumbnail URL only, never the full photo
// (F-06, architecture §9).
export const billRow = v.object({
  _id: v.id("transactions"),
  clientId: v.string(),
  kind: v.union(v.literal("sale"), v.literal("purchase")),
  dateBs: v.string(),
  partyId: v.optional(v.id("parties")),
  partyName: v.optional(v.string()),
  isWalkIn: v.boolean(),
  amountPaisa: v.optional(v.number()),
  capturedAt: v.number(),
  thumbUrl: v.union(v.string(), v.null()),
});

export type BillRow = typeof billRow.type;

/** v1 bills are sales or purchases; v1.1 kinds never reach these lists. */
export function isBill(
  row: Doc<"transactions">,
): row is Doc<"transactions"> & { kind: "sale" | "purchase" } {
  return row.kind === "sale" || row.kind === "purchase";
}

export async function toBillRow(
  ctx: QueryCtx,
  row: Doc<"transactions"> & { kind: "sale" | "purchase" },
): Promise<BillRow> {
  const party = row.partyId ? await ctx.db.get(row.partyId) : null;
  const first = row.photos[0];
  return {
    _id: row._id,
    clientId: row.clientId,
    kind: row.kind,
    dateBs: row.dateBs,
    ...(row.partyId ? { partyId: row.partyId } : {}),
    ...(party ? { partyName: party.displayName } : {}),
    isWalkIn: party?.isWalkIn ?? false,
    ...(row.amountPaisa === undefined ? {} : { amountPaisa: row.amountPaisa }),
    capturedAt: row.clientCapturedAt ?? row.capturedAt,
    thumbUrl: first ? await ctx.storage.getUrl(first.thumbId) : null,
  };
}
