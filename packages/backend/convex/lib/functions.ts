import type { Role } from "@mero-pasal/shared/domain";
import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import type { Doc } from "../_generated/dataModel";
import { mutation, type QueryCtx, query } from "../_generated/server";
import { appError } from "./errors";

// Architecture §6 and §10. Every public function is built from these wrappers; feature modules
// may not import raw `query`/`mutation` (Biome rule). `shopId` always comes from the caller's
// member row, never from arguments (AGENTS.md rule 4).

const ANY_MEMBER: readonly Role[] = ["owner", "admin", "staff"];
const OWNER_OR_ADMIN: readonly Role[] = ["owner", "admin"];
const ADMIN_ONLY: readonly Role[] = ["admin"];

/**
 * The caller's active member row, or null if signed out, not invited, or deactivated.
 * Throws CONFLICT if one Clerk user has several active rows: that is a data bug (e.g. a future
 * re-invite that inserted instead of reactivating) and must not silently pick a shop.
 */
export async function getMemberOrNull(ctx: QueryCtx): Promise<Doc<"members"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const rows = await ctx.db
    .query("members")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
    .take(10);
  const active = rows.filter((row) => row.active);
  if (active.length > 1) throw appError("CONFLICT", "More than one active member row");
  return active[0] ?? null;
}

async function requireRole(ctx: QueryCtx, allowed: readonly Role[]) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw appError("UNAUTHENTICATED");
  const member = await getMemberOrNull(ctx);
  if (!member) throw appError("FORBIDDEN", "Not a member of this shop");
  if (!allowed.includes(member.role)) {
    throw appError("FORBIDDEN", `Role ${member.role} cannot do this`);
  }
  return { member, shopId: member.shopId };
}

/** Any caller. `ctx.member` is the active member or null; for `members.me` and similar. */
export const optionalMemberQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ member: await getMemberOrNull(ctx) })),
);

/** Any active member (owner, admin, staff). */
export const memberQuery = customQuery(
  query,
  customCtx((ctx) => requireRole(ctx, ANY_MEMBER)),
);
/** Any active member (owner, admin, staff). */
export const memberMutation = customMutation(
  mutation,
  customCtx((ctx) => requireRole(ctx, ANY_MEMBER)),
);
/** Owner or admin (edit or archive accounts). */
export const ownerMutation = customMutation(
  mutation,
  customCtx((ctx) => requireRole(ctx, OWNER_OR_ADMIN)),
);
/** Admin only (merge, restore, members, export). */
export const adminQuery = customQuery(
  query,
  customCtx((ctx) => requireRole(ctx, ADMIN_ONLY)),
);
/** Admin only (merge, restore, members, export). */
export const adminMutation = customMutation(
  mutation,
  customCtx((ctx) => requireRole(ctx, ADMIN_ONLY)),
);
