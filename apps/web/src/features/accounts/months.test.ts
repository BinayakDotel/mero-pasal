import { describe, expect, it } from "vitest";
import { monthLabel, recentMonths } from "./months";

describe("account page months (F-07)", () => {
  it("lists this month and the ones before, across the year boundary", () => {
    expect(recentMonths("2083-02", 4)).toEqual(["2083-02", "2083-01", "2082-12", "2082-11"]);
  });

  it("labels a month with its name and year", () => {
    expect(monthLabel("2083-06", "ne")).toBe("असोज २०८३");
    expect(monthLabel("2083-06", "en")).toMatch(/ 2083$/);
  });
});
