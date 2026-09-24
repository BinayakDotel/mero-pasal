import { describe, expect, it } from "vitest";
import { rupeesToPaisa } from "../money/money";
import {
  BILL_KINDS,
  canEditBill,
  LARGE_AMOUNT_CONFIRM_PAISA,
  STAFF_EDIT_WINDOW_MS,
  TX_KINDS,
} from "./domain";

describe("domain constants", () => {
  it("F-03: the large-amount confirm threshold is रु 5,00,000", () => {
    expect(LARGE_AMOUNT_CONFIRM_PAISA).toBe(rupeesToPaisa(500_000));
  });

  it("ADR-006: bill kinds are a subset of transaction kinds", () => {
    for (const kind of BILL_KINDS) expect(TX_KINDS).toContain(kind);
  });
});

describe("canEditBill (F-08 permission matrix)", () => {
  const bill = { createdBy: "m_staff", capturedAt: 1_000_000 };
  const at = (ms: number) => bill.capturedAt + ms;

  it("owner and admin may change any bill, any time", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(canEditBill({ memberId: "m_other", role }, bill, at(30 * STAFF_EDIT_WINDOW_MS))).toBe(
        true,
      );
    }
  });

  it("staff: only their own bills, and only within 24 hours", () => {
    const staff = { memberId: "m_staff", role: "staff" as const };
    expect(canEditBill(staff, bill, at(STAFF_EDIT_WINDOW_MS))).toBe(true);
    expect(canEditBill(staff, bill, at(STAFF_EDIT_WINDOW_MS + 1))).toBe(false);
    expect(canEditBill({ ...staff, memberId: "m_else" }, bill, at(0))).toBe(false);
  });
});
