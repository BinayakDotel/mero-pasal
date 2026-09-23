import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// F-15: every create, correct, remove, restore, merge and role change leaves a trail.
export async function writeAudit(
  ctx: MutationCtx,
  entry: {
    shopId: Id<"shops">;
    actorId: Id<"members">;
    action: string;
    entity: Doc<"auditLog">["entity"];
    entityId: string;
    summary: string;
  },
): Promise<void> {
  await ctx.db.insert("auditLog", { ...entry, at: Date.now() });
}
