import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { appError } from "./lib/errors";
import { adminMutation, adminQuery } from "./lib/functions";
import { role } from "./schema";

// F-13 members, admin only (ADR-034). Invites are member rows with an email and no Clerk user;
// members.claimInvite links them.

const MAX_MEMBERS = 100;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const list = adminQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("members"),
      displayName: v.string(),
      email: v.optional(v.string()),
      role,
      active: v.boolean(),
      /** Invited, not signed in yet. */
      invited: v.boolean(),
      lastSeenAt: v.optional(v.number()),
      lastSyncAt: v.optional(v.number()),
      pending: v.number(),
      failed: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const members = await ctx.db
      .query("members")
      .withIndex("by_shop", (q) => q.eq("shopId", ctx.shopId))
      .take(MAX_MEMBERS);
    const health = await ctx.db
      .query("memberSync")
      .withIndex("by_shop", (q) => q.eq("shopId", ctx.shopId))
      .take(MAX_MEMBERS);
    const byMember = new Map(health.map((h) => [h.memberId as string, h]));
    return members.map((m) => {
      const h = byMember.get(m._id);
      return {
        _id: m._id,
        displayName: m.displayName,
        ...(m.email === undefined ? {} : { email: m.email }),
        role: m.role,
        active: m.active,
        invited: m.clerkUserId === undefined,
        ...(h ? { lastSeenAt: h.lastSeenAt } : {}),
        ...(h?.lastSyncAt === undefined ? {} : { lastSyncAt: h.lastSyncAt }),
        pending: h?.pending ?? 0,
        failed: h?.failed ?? 0,
      };
    });
  },
});

/** A member of the caller's shop, or NOT_FOUND. */
async function memberOfShop(ctx: MutationCtx & { shopId: Id<"shops"> }, id: Id<"members">) {
  const member = await ctx.db.get(id);
  if (!member || member.shopId !== ctx.shopId) throw appError("NOT_FOUND");
  return member;
}

/**
 * Nobody changes their own role or access. That alone keeps an admin: only an active admin can
 * call these, and they can't demote or deactivate themselves.
 */
function assertNotSelf(ctx: { member: Doc<"members"> }, target: Doc<"members">) {
  if (target._id === ctx.member._id) {
    throw appError("VALIDATION", "You can't change your own role or access");
  }
}

/**
 * One active membership per person: getMemberOrNull refuses a Clerk user with two, and
 * claimInvite refuses an email with two open invites. Refuse to switch a row back on while its
 * user, or its email, is active in another shop.
 */
async function assertFreeToActivate(ctx: MutationCtx, row: Doc<"members">) {
  const { clerkUserId, email } = row;
  const others = [
    ...(clerkUserId === undefined
      ? []
      : await ctx.db
          .query("members")
          .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
          .take(10)),
    ...(email === undefined
      ? []
      : await ctx.db
          .query("members")
          .withIndex("by_email", (q) => q.eq("email", email))
          .take(10)),
  ];
  if (others.some((m) => m._id !== row._id && m.active)) {
    throw appError("CONFLICT", "This person is active in another shop");
  }
}

/** F-13 invite: an email, a name and a role. Re-inviting someone reactivates their old row. */
export const invite = adminMutation({
  args: { email: v.string(), displayName: v.string(), role },
  returns: v.id("members"),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const displayName = args.displayName.trim();
    if (!EMAIL.test(email)) throw appError("VALIDATION", "Enter an email address");
    if (!displayName) throw appError("VALIDATION", "Enter a name");
    const same = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(10);
    if (same.some((m) => m.shopId !== ctx.shopId && m.active)) {
      throw appError("CONFLICT", "This email belongs to another shop");
    }
    const here = same.find((m) => m.shopId === ctx.shopId);
    if (here?.active) throw appError("CONFLICT", "Already a member");
    if (here) await assertFreeToActivate(ctx, here);
    const now = Date.now();
    const id =
      here?._id ??
      (await ctx.db.insert("members", {
        shopId: ctx.shopId,
        email,
        displayName,
        role: args.role,
        locale: args.role === "admin" ? "en" : "ne",
        active: true,
        invitedAt: now,
        invitedBy: ctx.member._id,
      }));
    if (here) {
      await ctx.db.patch(here._id, {
        active: true,
        displayName,
        role: args.role,
        invitedAt: now,
        invitedBy: ctx.member._id,
      });
    }
    await writeAudit(ctx, {
      shopId: ctx.shopId,
      actorId: ctx.member._id,
      action: here ? "member.reinvite" : "member.invite",
      entity: "member",
      entityId: id,
      summary: `${displayName} <${email}> as ${args.role}`,
    });
    return id;
  },
});

export const setRole = adminMutation({
  args: { memberId: v.id("members"), role },
  returns: v.null(),
  handler: async (ctx, { memberId, role: next }) => {
    const target = await memberOfShop(ctx, memberId);
    assertNotSelf(ctx, target);
    if (target.role === next) return null;
    await ctx.db.patch(memberId, { role: next });
    await writeAudit(ctx, {
      shopId: ctx.shopId,
      actorId: ctx.member._id,
      action: "member.role",
      entity: "member",
      entityId: memberId,
      summary: `${target.displayName}: ${target.role} → ${next}`,
    });
    return null;
  },
});

/** F-13 deactivate / reactivate: access ends (or returns); the member row and history stay. */
export const setActive = adminMutation({
  args: { memberId: v.id("members"), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { memberId, active }) => {
    const target = await memberOfShop(ctx, memberId);
    assertNotSelf(ctx, target);
    if (target.active === active) return null;
    if (active) await assertFreeToActivate(ctx, target);
    await ctx.db.patch(memberId, { active });
    await writeAudit(ctx, {
      shopId: ctx.shopId,
      actorId: ctx.member._id,
      action: active ? "member.reactivate" : "member.deactivate",
      entity: "member",
      entityId: memberId,
      summary: `${target.displayName} ${active ? "reactivated" : "deactivated"}`,
    });
    return null;
  },
});
