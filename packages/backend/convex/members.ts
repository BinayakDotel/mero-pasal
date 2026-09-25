import { v } from "convex/values";
import { writeAudit } from "./lib/audit";
import { appError } from "./lib/errors";
import { memberMutation, optionalMemberMutation, optionalMemberQuery } from "./lib/functions";
import { locale, role } from "./schema";

/**
 * F-01: who am I in this shop? Returns null for a signed-in user without an active member row,
 * which drives the "Not invited" screen. Never throws for non-members.
 */
export const me = optionalMemberQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      member: v.object({
        _id: v.id("members"),
        displayName: v.string(),
        role,
        locale,
      }),
      shop: v.object({
        _id: v.id("shops"),
        name: v.string(),
        nameNe: v.optional(v.string()),
      }),
    }),
  ),
  handler: async (ctx) => {
    const { member } = ctx;
    if (!member) return null;
    const shop = await ctx.db.get(member.shopId);
    if (!shop) return null;
    return {
      member: {
        _id: member._id,
        displayName: member.displayName,
        role: member.role,
        locale: member.locale,
      },
      shop:
        shop.nameNe === undefined
          ? { _id: shop._id, name: shop.name }
          : { _id: shop._id, name: shop.name, nameNe: shop.nameNe },
    };
  },
});

/**
 * M2 / F-09: the phone reports it's alive and how its outbox is doing. `drained` = everything
 * was sent just now. Throttled by the client; one small row per member.
 */
export const heartbeat = memberMutation({
  args: {
    drained: v.boolean(),
    pending: v.number(),
    failed: v.number(),
    oldestPendingAt: v.optional(v.number()),
    foreignPending: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const n of [args.pending, args.failed, args.foreignPending]) {
      if (!Number.isSafeInteger(n) || n < 0)
        throw appError("VALIDATION", "Counts must be whole numbers ≥ 0");
    }
    const now = Date.now();
    const row = {
      shopId: ctx.shopId,
      memberId: ctx.member._id,
      lastSeenAt: now,
      pending: args.pending,
      failed: args.failed,
      foreignPending: args.foreignPending,
      ...(args.oldestPendingAt === undefined ? {} : { oldestPendingAt: args.oldestPendingAt }),
    };
    const existing = await ctx.db
      .query("memberSync")
      .withIndex("by_member", (q) => q.eq("memberId", ctx.member._id))
      .unique();
    const lastSyncAt = args.drained ? now : existing?.lastSyncAt;
    const next = { ...row, ...(lastSyncAt === undefined ? {} : { lastSyncAt }) };
    if (existing) await ctx.db.replace(existing._id, next);
    else await ctx.db.insert("memberSync", next);
    return null;
  },
});

/**
 * F-10: remember the member's language. A preference, not a bill, so the web app calls this
 * directly rather than through the outbox (documented exception, code-standard §5).
 */
export const setLocale = memberMutation({
  args: { locale },
  returns: v.null(),
  handler: async (ctx, { locale: next }) => {
    await ctx.db.patch(ctx.member._id, { locale: next });
    return null;
  },
});

/**
 * F-13 / ADR-034: link an invite on first sign-in. The signed-in user's **verified** email
 * (trimmed, lowercased, like the invite) must match an active invite nobody has claimed. Needs
 * `email` and `email_verified` in the Clerk session token. Safe to call again.
 */
export const claimInvite = optionalMemberMutation({
  args: {},
  returns: v.union(
    v.literal("member"),
    v.literal("claimed"),
    v.literal("notInvited"),
    v.literal("noVerifiedEmail"),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED");
    if (ctx.member) return "member";
    const email = identity.email?.trim().toLowerCase();
    if (!email || identity.emailVerified !== true) return "noVerifiedEmail";
    const rows = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(10);
    const open = rows.filter((row) => row.active && row.clerkUserId === undefined);
    const invite = open[0];
    if (!invite) return "notInvited";
    if (open.length > 1) throw appError("CONFLICT", "Invited to more than one shop");
    await ctx.db.patch(invite._id, { clerkUserId: identity.subject });
    await writeAudit(ctx, {
      shopId: invite.shopId,
      actorId: invite._id,
      action: "member.claim",
      entity: "member",
      entityId: invite._id,
      summary: `${email} signed in for the first time`,
    });
    return "claimed";
  },
});
