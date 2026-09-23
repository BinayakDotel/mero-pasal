import { describe, expect, it } from "vitest";
import { backspace, digitsToPaisa, MAX_AMOUNT_DIGITS, pressKey } from "./amount-entry";

describe("amount entry (F-03, ADR-007)", () => {
  it("types like a calculator", () => {
    const typed = ["2", "3", "4", "0"].reduce((d, k) => pressKey(d, k as "2"), "");
    expect(typed).toBe("2340");
    expect(pressKey("23", "00")).toBe("2300");
  });

  it("ignores leading zeros", () => {
    expect(pressKey("", "0")).toBe("");
    expect(pressKey("", "00")).toBe("");
    expect(pressKey("5", "0")).toBe("50");
  });

  it(`stops at ${MAX_AMOUNT_DIGITS} digits`, () => {
    const full = "9".repeat(MAX_AMOUNT_DIGITS);
    expect(pressKey(full, "1")).toBe(full);
    expect(pressKey("9".repeat(MAX_AMOUNT_DIGITS - 1), "00")).toBe(
      "9".repeat(MAX_AMOUNT_DIGITS - 1),
    );
  });

  it("backspace removes the last digit", () => {
    expect(backspace("2340")).toBe("234");
    expect(backspace("")).toBe("");
  });

  it("converts to integer paisa, or undefined when nothing was typed", () => {
    expect(digitsToPaisa("2340")).toBe(234_000);
    expect(digitsToPaisa("")).toBeUndefined();
    expect(digitsToPaisa("9".repeat(MAX_AMOUNT_DIGITS))).toBe(99_999_999_900);
  });
});
