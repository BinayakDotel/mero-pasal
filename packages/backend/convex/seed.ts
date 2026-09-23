import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { appError } from "./lib/errors";

// F-01 / architecture §11: one-time setup of the shop, its owner and admin, and the built-in
// walk-in account. Run by a human on the dev deployment (never by an agent against prod):
//   pnpm --filter @mero-pasal/backend exec convex run seed:bootstrap '{ ... }'

const person = v.object({
  clerkUserId: v.string(),
  displayName: v.string(),
  email: v.optional(v.string()),
});

export const WALK_IN_CLIENT_ID = "walk-in";
/** Phonetic keys are lowercase letters only, so this can never match a real name lookup. */
export const WALK_IN_PHONETIC_KEY = "#walk-in";

function required(label: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") throw appError("VALIDATION", `${label} is required`);
  return trimmed;
}

export const bootstrap = internalMutation({
  args: {
    shopName: v.string(),
    shopNameNe: v.optional(v.string()),
    owner: person,
    admin: person,
  },
  returns: v.id("shops"),
  handler: async (ctx, { shopName, shopNameNe, owner, admin }) => {
    if (await ctx.db.query("shops").first()) {
      throw appError("CONFLICT", "A shop already exists; bootstrap runs once");
    }
    const ownerClerkId = required("owner.clerkUserId", owner.clerkUserId);
    const adminClerkId = required("admin.clerkUserId", admin.clerkUserId);
    if (ownerClerkId === adminClerkId) {
      throw appError("VALIDATION", "Owner and admin must be different Clerk users");
    }

    const now = Date.now();
    const shopId = await ctx.db.insert("shops", {
      name: required("shopName", shopName),
      createdAt: now,
      ...(shopNameNe === undefined ? {} : { nameNe: shopNameNe }),
    });

    const addMember = (who: typeof owner, role: "owner" | "admin", locale: "ne" | "en") =>
      ctx.db.insert("members", {
        shopId,
        clerkUserId: required("clerkUserId", who.clerkUserId),
        displayName: required("displayName", who.displayName),
        role,
        locale,
        active: true,
        // M4's claim-by-email must normalise the same way (trim + lowercase).
        ...(who.email === undefined ? {} : { email: who.email.trim().toLowerCase() }),
      });
    await addMember(owner, "owner", "ne"); // Buwa: Nepali by default (F-10)
    const adminId = await addMember(admin, "admin", "en"); // admin console is English (ui-ux §6)

    await ctx.db.insert("parties", {
      shopId,
      clientId: WALK_IN_CLIENT_ID,
      kind: "customer",
      displayName: "नगद ग्राहक",
      nameLatin: "nagad grahak",
      nameDevanagari: "नगद ग्राहक",
      // Pinned in the picker and never name-matched (F-04).
      phoneticKey: WALK_IN_PHONETIC_KEY,
      isWalkIn: true,
      archived: false,
      lastUsedAt: now,
      billCount: 0,
      salePaisa: 0,
      purchasePaisa: 0,
      balancePaisa: 0,
      createdBy: adminId,
      createdAt: now,
    });

    return shopId;
  },
});
