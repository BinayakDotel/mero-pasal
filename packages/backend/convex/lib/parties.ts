import type { Doc } from "../_generated/dataModel";

/** ADR-037: deleted, or being deleted. Either way it has left every list and picker. */
export function isDeleted(party: Pick<Doc<"parties">, "deletedAt" | "deletingAt">): boolean {
  return party.deletedAt !== undefined || party.deletingAt !== undefined;
}
