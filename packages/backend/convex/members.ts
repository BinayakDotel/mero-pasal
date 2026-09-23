import { v } from "convex/values";
import { optionalMemberQuery } from "./lib/functions";
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
