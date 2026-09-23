import { describe, expect, it } from "vitest";
import { rupeesToPaisa } from "../money/money";
import { BILL_KINDS, LARGE_AMOUNT_CONFIRM_PAISA, TX_KINDS } from "./domain";

describe("domain constants", () => {
  it("F-03: the large-amount confirm threshold is रु 5,00,000", () => {
    expect(LARGE_AMOUNT_CONFIRM_PAISA).toBe(rupeesToPaisa(500_000));
  });

  it("ADR-006: bill kinds are a subset of transaction kinds", () => {
    for (const kind of BILL_KINDS) expect(TX_KINDS).toContain(kind);
  });
});
