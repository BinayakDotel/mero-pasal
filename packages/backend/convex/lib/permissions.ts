import { canEditBill } from "@mero-pasal/shared/domain";
import type { Doc } from "../_generated/dataModel";
import { appError } from "./errors";

/**
 * F-08 / architecture §10.3: may this member correct or remove this bill? Same rule as the app
 * (`canEditBill`); the bill must also be in the member's own shop. Throws FORBIDDEN otherwise.
 */
export function assertCanEdit(member: Doc<"members">, tx: Doc<"transactions">, now: number): void {
  if (tx.shopId !== member.shopId) throw appError("NOT_FOUND");
  const allowed = canEditBill(
    { memberId: member._id, role: member.role },
    { createdBy: tx.createdBy, capturedAt: tx.capturedAt },
    now,
  );
  if (!allowed) {
    throw appError(
      "FORBIDDEN",
      "Staff can change only their own bills within 24 hours",
      "NOT_EDITABLE",
    );
  }
}
