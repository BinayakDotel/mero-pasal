import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isBill } from "./billRow";
import { appError } from "./errors";

// Shared by the bill functions (transactions.ts, billAdmin.ts): finding a bill by the phone's
// clientId and resolving an account reference through merges.

const MAX_MERGE_HOPS = 10;

/** F-04 / architecture §5.3 invariant 7: an account reference from the phone, merges followed. */
export async function resolveParty(
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

/** A bill to correct or remove, by the clientId the phone knows (NOT_FOUND while unsent). */
export async function billByClientId(ctx: QueryCtx & { shopId: Id<"shops"> }, clientId: string) {
  const row = await ctx.db
    .query("transactions")
    .withIndex("by_shop_clientId", (q) => q.eq("shopId", ctx.shopId).eq("clientId", clientId))
    .unique();
  if (!row || !isBill(row)) throw appError("NOT_FOUND", "Bill not on the server (yet)");
  return row;
}
