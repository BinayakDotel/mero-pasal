/// <reference types="vite/client" />
// Every Convex module, for convex-test (it locates `_generated/api.js` in this map). Tests,
// type declarations and this file are not Convex function modules.
export const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
  "!./test.setup.ts",
]);

import type { TestConvex } from "convex-test";
import { internal } from "./_generated/api";
import type schema from "./schema";

export const OWNER = "user_owner";
export const ADMIN = "user_admin";

/** A seeded shop (owner, admin, walk-in) for backend tests. */
export async function seedShop(t: TestConvex<typeof schema>) {
  const shopId = await t.mutation(internal.seed.bootstrap, {
    shopName: "Kavre Store",
    owner: { clerkUserId: OWNER, displayName: "Owner" },
    admin: { clerkUserId: ADMIN, displayName: "Admin" },
  });
  return {
    shopId,
    asOwner: t.withIdentity({ subject: OWNER }),
    asAdmin: t.withIdentity({ subject: ADMIN }),
  };
}
