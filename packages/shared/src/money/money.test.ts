import { describe, expect, it } from "vitest";
import { assertPaisa, formatNpr, paisaToRupees, rupeesToPaisa, sumPaisa } from "./money";

describe("rupeesToPaisa", () => {
  it("F-03: converts whole rupees from the number pad", () => {
    expect(rupeesToPaisa(0)).toBe(0);
    expect(rupeesToPaisa(2340)).toBe(234_000);
    expect(rupeesToPaisa(500_000)).toBe(50_000_000);
  });

  it("ADR-007: rejects fractional rupees", () => {
    expect(() => rupeesToPaisa(2340.5)).toThrow(RangeError);
    expect(() => rupeesToPaisa(0.1)).toThrow(RangeError);
  });

  it("rejects NaN, Infinity and unsafe integers", () => {
    expect(() => rupeesToPaisa(Number.NaN)).toThrow(RangeError);
    expect(() => rupeesToPaisa(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => rupeesToPaisa(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it("rejects rupees whose paisa value would overflow the safe range", () => {
    expect(() => rupeesToPaisa(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });
});

describe("paisaToRupees", () => {
  it("converts paisa back to rupees", () => {
    expect(paisaToRupees(234_000)).toBe(2340);
    expect(paisaToRupees(234_050)).toBe(2340.5);
    expect(paisaToRupees(-120_000)).toBe(-1200);
  });

  it("rejects non-integer paisa", () => {
    expect(() => paisaToRupees(1.5)).toThrow(RangeError);
  });
});

describe("assertPaisa", () => {
  it("accepts safe integers and rejects everything else", () => {
    expect(() => assertPaisa(0)).not.toThrow();
    expect(() => assertPaisa(-5)).not.toThrow();
    expect(() => assertPaisa(0.5)).toThrow(RangeError);
    expect(() => assertPaisa(Number.NaN)).toThrow(RangeError);
  });
});

describe("sumPaisa", () => {
  it("F-02: sums exactly where floats would drift", () => {
    // 0.1 + 0.2 rupees as floats is 0.30000000000000004; in paisa it is exact.
    expect(sumPaisa([10, 20])).toBe(30);
    expect(sumPaisa([234_000, 1_845_000, 99])).toBe(2_079_099);
  });

  it("returns 0 for an empty list", () => {
    expect(sumPaisa([])).toBe(0);
  });

  it("rejects a non-integer item", () => {
    expect(() => sumPaisa([100, 0.5])).toThrow(RangeError);
  });

  it("rejects a total that leaves the safe range", () => {
    expect(() => sumPaisa([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});

describe("formatNpr", () => {
  it("F-10: uses lakh grouping with Latin digits and the रु prefix in Nepali", () => {
    expect(formatNpr(12_345_600, { locale: "ne" })).toBe("रु 1,23,456");
    expect(formatNpr(234_000, { locale: "ne" })).toBe("रु 2,340");
  });

  it("F-10: uses the Rs prefix in English", () => {
    expect(formatNpr(12_345_600, { locale: "en" })).toBe("Rs 1,23,456");
  });

  it("groups crores the Indian way", () => {
    expect(formatNpr(12_345_678_900, { locale: "en" })).toBe("Rs 12,34,56,789");
  });

  it("formats zero and small amounts", () => {
    expect(formatNpr(0, { locale: "ne" })).toBe("रु 0");
    expect(formatNpr(900, { locale: "en" })).toBe("Rs 9");
  });

  it("shows paisa only when non-zero, zero-padded", () => {
    expect(formatNpr(234_050, { locale: "ne" })).toBe("रु 2,340.50");
    expect(formatNpr(234_005, { locale: "ne" })).toBe("रु 2,340.05");
    expect(formatNpr(5, { locale: "en" })).toBe("Rs 0.05");
  });

  it("v1.1 balances: puts the minus before the currency", () => {
    expect(formatNpr(-120_000, { locale: "ne" })).toBe("-रु 1,200");
    expect(formatNpr(-50, { locale: "en" })).toBe("-Rs 0.50");
  });

  it("rejects non-integer paisa", () => {
    expect(() => formatNpr(10.5, { locale: "en" })).toThrow(RangeError);
  });
});
