import { STAFF_EDIT_WINDOW_MS } from "@mero-pasal/shared/domain";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Doc } from "./_generated/dataModel";
import { assertCanEdit } from "./lib/permissions";
import schema from "./schema";
import { modules, seedShop } from "./test.setup";

// F-08 permission matrix on real rows: owner/admin any bill; staff own within 24 h; other
// shops never.
describe("assertCanEdit (F-08, architecture §10.3)", () => {
  it("applies the matrix to stored members and bills", async () => {
    const t = convexTest(schema, modules);
    const { shopId } = await seedShop(t);
    const { members, staff, bill, foreign } = await t.run(async (ctx) => {
      const staffId = await ctx.db.insert("members", {
        shopId,
        clerkUserId: "user_staff",
        displayName: "Aama",
        role: "staff",
        locale: "ne",
        active: true,
      });
      const otherShop = await ctx.db.insert("shops", { name: "Other", createdAt: 0 });
      const txOf = async (shop: typeof shopId) => {
        const id = await ctx.db.insert("transactions", {
          shopId: shop,
          clientId: crypto.randomUUID(),
          kind: "sale",
          status: "active",
          dateBs: "2083-06-07",
          dateAd: 0,
          needsAttention: true,
          capturedAt: 1_000,
          updatedAt: 1_000,
          createdBy: staffId,
          photos: [],
        });
        return (await ctx.db.get(id)) as Doc<"transactions">;
      };
      return {
        members: await ctx.db.query("members").collect(),
        staff: (await ctx.db.get(staffId)) as Doc<"members">,
        bill: await txOf(shopId),
        foreign: await txOf(otherShop),
      };
    });
    const owner = members.find((m) => m.role === "owner") as Doc<"members">;

    expect(() => assertCanEdit(owner, bill, 1_000 + 90 * STAFF_EDIT_WINDOW_MS)).not.toThrow();
    expect(() => assertCanEdit(staff, bill, 1_000 + STAFF_EDIT_WINDOW_MS)).not.toThrow();
    expect(() => assertCanEdit(staff, bill, 1_000 + STAFF_EDIT_WINDOW_MS + 1)).toThrow(/FORBIDDEN/);
    expect(() => assertCanEdit(staff, { ...bill, createdBy: owner._id }, 1_000)).toThrow(
      /FORBIDDEN/,
    );
    expect(() => assertCanEdit(owner, foreign, 1_000)).toThrow(/NOT_FOUND/);
  });
});
