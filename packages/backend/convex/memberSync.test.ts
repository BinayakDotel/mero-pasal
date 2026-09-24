import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules, seedShop } from "./test.setup";

const beat = { drained: false, pending: 0, failed: 0, foreignPending: 0 };

describe("members.heartbeat (M2, F-09)", () => {
  it("records last seen, and last sync only when the outbox drained", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedShop(t);
    await asOwner.mutation(api.members.heartbeat, { ...beat, pending: 3, oldestPendingAt: 1000 });
    let row = await t.run((ctx) => ctx.db.query("memberSync").first());
    expect(row).toMatchObject({ pending: 3, oldestPendingAt: 1000, failed: 0 });
    expect(row).not.toHaveProperty("lastSyncAt");

    await asOwner.mutation(api.members.heartbeat, { ...beat, drained: true });
    row = await t.run((ctx) => ctx.db.query("memberSync").first());
    expect(row?.lastSyncAt).toBeTypeOf("number");
    expect(row).not.toHaveProperty("oldestPendingAt");
    const syncedAt = row?.lastSyncAt;

    await asOwner.mutation(api.members.heartbeat, { ...beat, failed: 1 });
    row = await t.run((ctx) => ctx.db.query("memberSync").first());
    expect(row).toMatchObject({ failed: 1, lastSyncAt: syncedAt }); // kept until the next drain
    expect(await t.run((ctx) => ctx.db.query("memberSync").collect())).toHaveLength(1);
  });

  it("keeps one row per member and rejects bad counts or strangers", async () => {
    const t = convexTest(schema, modules);
    const { asOwner, asAdmin } = await seedShop(t);
    await asOwner.mutation(api.members.heartbeat, beat);
    await asAdmin.mutation(api.members.heartbeat, { ...beat, foreignPending: 2 });
    expect(await t.run((ctx) => ctx.db.query("memberSync").collect())).toHaveLength(2);
    await expect(asOwner.mutation(api.members.heartbeat, { ...beat, pending: -1 })).rejects.toThrow(
      /VALIDATION/,
    );
    await expect(asOwner.mutation(api.members.heartbeat, { ...beat, failed: 1.5 })).rejects.toThrow(
      /VALIDATION/,
    );
    await expect(
      t.withIdentity({ subject: "user_stranger" }).mutation(api.members.heartbeat, beat),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("doesn't touch the members row (so member queries don't re-run)", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedShop(t);
    const before = await t.run((ctx) => ctx.db.query("members").collect());
    await asOwner.mutation(api.members.heartbeat, beat);
    expect(await t.run((ctx) => ctx.db.query("members").collect())).toEqual(before);
  });
});
