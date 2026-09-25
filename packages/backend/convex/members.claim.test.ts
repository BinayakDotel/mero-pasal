import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, seedShop } from "./test.setup";

// F-13 / ADR-034: an invite is a member row with an email; the person links it the first time
// they sign in with that (verified) email.
async function setup() {
  const t = convexTest(schema, modules);
  const shop = await seedShop(t);
  const invite = (email: string, shopId: Id<"shops"> = shop.shopId) =>
    t.run((ctx) =>
      ctx.db.insert("members", {
        shopId,
        email,
        displayName: "Aama",
        role: "staff",
        locale: "ne",
        active: true,
        invitedAt: 1,
      }),
    );
  const signedIn = (subject: string, email?: string, emailVerified = true) =>
    t.withIdentity({ subject, ...(email ? { email, emailVerified } : {}) });
  return { t, ...shop, invite, signedIn };
}

describe("members.claimInvite (F-13)", () => {
  it("links the invite on first sign-in; the person is then a member; again is a no-op", async () => {
    const { t, invite, signedIn } = await setup();
    const id = await invite("aama@example.com");
    const aama = signedIn("user_aama", "  Aama@Example.com ");
    expect(await aama.query(api.members.me, {})).toBeNull();
    expect(await aama.mutation(api.members.claimInvite, {})).toBe("claimed");
    expect((await aama.query(api.members.me, {}))?.member._id).toBe(id);
    expect(await aama.mutation(api.members.claimInvite, {})).toBe("member");
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.filter((a) => a.action === "member.claim")).toHaveLength(1);
  });

  it("refuses an unverified or missing email, and an email nobody invited", async () => {
    const { invite, signedIn } = await setup();
    await invite("aama@example.com");
    expect(
      await signedIn("u1", "aama@example.com", false).mutation(api.members.claimInvite, {}),
    ).toBe("noVerifiedEmail");
    expect(await signedIn("u2").mutation(api.members.claimInvite, {})).toBe("noVerifiedEmail");
    expect(await signedIn("u3", "stranger@example.com").mutation(api.members.claimInvite, {})).toBe(
      "notInvited",
    );
  });

  it("a claimed invite can't be taken by another account; a deactivated one can't be claimed", async () => {
    const { t, invite, signedIn } = await setup();
    const id = await invite("aama@example.com");
    await signedIn("user_aama", "aama@example.com").mutation(api.members.claimInvite, {});
    expect(
      await signedIn("user_other", "aama@example.com").mutation(api.members.claimInvite, {}),
    ).toBe("notInvited");
    await invite("gone@example.com").then((gone) =>
      t.run((ctx) => ctx.db.patch(gone, { active: false })),
    );
    expect(
      await signedIn("user_gone", "gone@example.com").mutation(api.members.claimInvite, {}),
    ).toBe("notInvited");
    expect((await t.run((ctx) => ctx.db.get(id)))?.clerkUserId).toBe("user_aama");
  });

  it("the same email invited by two shops is refused (CONFLICT)", async () => {
    const { t, invite, signedIn } = await setup();
    const other = await t.run((ctx) => ctx.db.insert("shops", { name: "Other", createdAt: 0 }));
    await invite("aama@example.com");
    await invite("aama@example.com", other);
    await expect(
      signedIn("user_aama", "aama@example.com").mutation(api.members.claimInvite, {}),
    ).rejects.toThrow(/CONFLICT/);
  });

  it("needs a signed-in caller", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.members.claimInvite, {})).rejects.toThrow(/UNAUTHENTICATED/);
  });
});
