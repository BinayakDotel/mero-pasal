import { addDaysBs } from "@mero-pasal/shared/dates";
import { describe, expect, it } from "vitest";
import type { BillItem } from "./bill-item";
import { dayHeader, groupByDay } from "./day-groups";

const today = "2083-06-07";
const words = { today: "आज", yesterday: "हिजो" };

describe("dayHeader (ui-ux §5.5)", () => {
  it("names today and yesterday with the date", () => {
    expect(dayHeader(today, today, "ne", words)).toBe("आज · ७ असोज");
    expect(dayHeader(addDaysBs(today, -1), today, "ne", words)).toBe("हिजो · ६ असोज");
  });

  it("uses the weekday within the week, then the date, then the year", () => {
    expect(dayHeader(addDaysBs(today, -2), today, "ne", words)).toMatch(/^.+बार · ५ असोज$/);
    expect(dayHeader(addDaysBs(today, -10), today, "en", words)).toMatch(/^\d+ \w+$/);
    expect(dayHeader("2082-12-01", today, "en", words)).toMatch(/ 2082$/);
  });
});

describe("groupByDay (F-06)", () => {
  const bill = (clientId: string, dateBs: string) =>
    ({ key: clientId, clientId, dateBs }) as BillItem;
  it("keeps list order and starts a group on each new date", () => {
    const groups = groupByDay([bill("a", today), bill("b", today), bill("c", "2083-06-05")]);
    expect(groups.map((g) => [g.dateBs, g.bills.map((b) => b.clientId)])).toEqual([
      [today, ["a", "b"]],
      ["2083-06-05", ["c"]],
    ]);
  });
});
