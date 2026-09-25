import { describe, expect, it } from "vitest";
import { monthRange, rangeArgs } from "./range";

describe("admin date range (F-11 bills filter)", () => {
  it("a BS month spans its real length", () => {
    expect(monthRange("2083-06").fromBs).toBe("2083-06-01");
    expect(monthRange("2083-06").toBs).toMatch(/^2083-06-(29|30|31|32)$/);
  });

  it("empty is open-ended; bad or reversed dates are not used", () => {
    expect(rangeArgs("", "")).toEqual({});
    expect(rangeArgs(" 2083-06-01 ", "")).toEqual({ fromBs: "2083-06-01" });
    expect(rangeArgs("", "2083-06-05")).toEqual({ toBs: "2083-06-05" });
    expect(rangeArgs("2083-06-01", "2083-06-05")).toEqual({
      fromBs: "2083-06-01",
      toBs: "2083-06-05",
    });
    expect(rangeArgs("2083-06-05", "2083-06-01")).toBeNull();
    expect(rangeArgs("2083-6-1", "")).toBeNull();
    expect(rangeArgs("2083-13-01", "")).toBeNull();
  });
});
