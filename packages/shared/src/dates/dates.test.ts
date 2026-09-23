import NepaliDate, { dateConfigMap } from "nepali-date-converter";
import { describe, expect, it } from "vitest";
import {
  addDaysBs,
  adMsToBs,
  BS_FIRST_DATE,
  BS_LAST_DATE,
  bsToAdMs,
  daysInMonthBs,
  diffDaysBs,
  fiscalYearOf,
  formatBs,
  isValidBs,
  monthOf,
  NPT_OFFSET_MS,
  parseBs,
  toDevanagariDigits,
  todayBs,
  weekdayOf,
} from "./dates";

// The mockup's "today": Wednesday, 7 Asoj 2083 = 2026-09-23.
const TODAY = "2083-06-07";
const NPT_MIDNIGHT_TODAY = Date.UTC(2026, 8, 22, 18, 15); // 00:00 NPT on 2026-09-23

describe("todayBs / adMsToBs (NPT)", () => {
  it("F-02: gives today's BS date in Nepal", () => {
    expect(todayBs(Date.UTC(2026, 8, 23, 6, 0))).toBe(TODAY);
  });

  it("NFR-09: flips at 00:00 NPT, i.e. 18:15 UTC the day before", () => {
    expect(adMsToBs(NPT_MIDNIGHT_TODAY - 1)).toBe("2083-06-06");
    expect(adMsToBs(NPT_MIDNIGHT_TODAY)).toBe(TODAY);
  });

  it("NFR-09: is right in the 00:00–05:45 NPT window where the UTC date is still yesterday", () => {
    const at2amNpt = Date.UTC(2026, 8, 22, 20, 15);
    expect(new Date(at2amNpt).toISOString().slice(0, 10)).toBe("2026-09-22"); // the trap
    expect(todayBs(at2amNpt)).toBe(TODAY);
  });

  it("throws outside the supported range", () => {
    expect(() => adMsToBs(Date.UTC(1943, 3, 13, 12))).toThrow(RangeError);
    expect(() => adMsToBs(Date.UTC(2034, 3, 14, 12))).toThrow(RangeError);
  });
});

describe("bsToAdMs", () => {
  it("ADR-008: returns UTC ms of 00:00 NPT", () => {
    expect(NPT_OFFSET_MS).toBe(20_700_000);
    expect(bsToAdMs(TODAY)).toBe(NPT_MIDNIGHT_TODAY);
  });

  it("round-trips with adMsToBs, and one ms earlier is the previous day", () => {
    for (const date of ["2000-01-01", "2082-12-30", "2083-04-01", TODAY, "2090-12-30"]) {
      expect(adMsToBs(bsToAdMs(date))).toBe(date);
    }
    expect(adMsToBs(bsToAdMs("2083-04-01") - 1)).toBe("2083-03-32");
  });

  it("FY 2083/84 began on 17 July 2026 (project-overview glossary)", () => {
    expect(bsToAdMs("2083-04-01")).toBe(Date.UTC(2026, 6, 16, 18, 15));
  });

  it("rejects invalid dates", () => {
    expect(() => bsToAdMs("2083-13-01")).toThrow(RangeError);
  });
});

describe("agreement with nepali-date-converter", () => {
  it("matches the library's BS→AD date and weekday for every supported day", () => {
    // The library is only a trustworthy oracle in a sane host zone (vitest.config.ts pins TZ).
    let date = BS_FIRST_DATE;
    let checked = 0;
    for (;;) {
      const { year, month, day } = parseBs(date);
      const ad = new NepaliDate(year, month - 1, day).getAD();
      const ours = new Date(bsToAdMs(date) + NPT_OFFSET_MS);
      expect([ours.getUTCFullYear(), ours.getUTCMonth(), ours.getUTCDate()]).toEqual([
        ad.year,
        ad.month,
        ad.date,
      ]);
      expect(weekdayOf(date)).toBe(ad.day);
      checked++;
      if (date === BS_LAST_DATE) break;
      date = addDaysBs(date, 1);
    }
    expect(checked).toBe(33_238);
  });

  it("uses the library's month lengths", () => {
    const table = dateConfigMap["2083"];
    expect(table).toBeDefined();
    expect(Object.values(table ?? {})).toEqual(
      Array.from({ length: 12 }, (_, i) => daysInMonthBs(2083, i + 1)),
    );
  });
});

describe("parseBs / isValidBs", () => {
  it("parses a zero-padded BS date", () => {
    expect(parseBs(TODAY)).toEqual({ year: 2083, month: 6, day: 7 });
  });

  it("accepts a 32-day month's last day", () => {
    expect(daysInMonthBs(2083, 3)).toBe(32);
    expect(isValidBs("2083-03-32")).toBe(true);
  });

  it("rejects malformed or impossible dates", () => {
    for (const bad of [
      "2083-6-7",
      "2083/06/07",
      "abc",
      "",
      "2083-06-00",
      "2083-04-32",
      "2083-00-01",
      "2083-13-01",
      "1999-12-30",
      "2091-01-01",
    ]) {
      expect(isValidBs(bad), bad).toBe(false);
    }
    expect(() => parseBs("2083-04-32")).toThrow(RangeError);
  });
});

describe("daysInMonthBs", () => {
  it("rejects years and months out of range or not whole", () => {
    expect(() => daysInMonthBs(1999, 1)).toThrow(RangeError);
    expect(() => daysInMonthBs(2091, 1)).toThrow(RangeError);
    expect(() => daysInMonthBs(2083.5, 1)).toThrow(RangeError);
    expect(() => daysInMonthBs(2083, 0)).toThrow(RangeError);
    expect(() => daysInMonthBs(2083, 13)).toThrow(RangeError);
    expect(() => daysInMonthBs(2083, 1.5)).toThrow(RangeError);
  });
});

describe("addDaysBs / diffDaysBs", () => {
  it("F-05: yesterday and the day before", () => {
    expect(addDaysBs(TODAY, -1)).toBe("2083-06-06");
    expect(addDaysBs(TODAY, -2)).toBe("2083-06-05");
    expect(addDaysBs(TODAY, 0)).toBe(TODAY);
  });

  it("crosses month and year boundaries", () => {
    expect(addDaysBs("2083-04-01", -1)).toBe("2083-03-32");
    const lastOf2082 = `2082-12-${daysInMonthBs(2082, 12)}`;
    expect(addDaysBs(lastOf2082, 1)).toBe("2083-01-01");
  });

  it("F-05: measures the 90-day back-date limit", () => {
    expect(diffDaysBs(addDaysBs(TODAY, -90), TODAY)).toBe(90);
    expect(diffDaysBs(TODAY, "2083-06-06")).toBe(-1);
  });

  it("rejects fractional days and leaving the supported range", () => {
    expect(() => addDaysBs(TODAY, 0.5)).toThrow(RangeError);
    expect(() => addDaysBs(BS_LAST_DATE, 1)).toThrow(RangeError);
    expect(() => addDaysBs(BS_FIRST_DATE, -1)).toThrow(RangeError);
  });
});

describe("weekdayOf", () => {
  it("7 Asoj 2083 is a Wednesday", () => {
    expect(weekdayOf(TODAY)).toBe(3);
    expect(weekdayOf("2083-06-11")).toBe(0);
  });
});

describe("monthOf / fiscalYearOf", () => {
  it("returns the BS month", () => {
    expect(monthOf(TODAY)).toBe("2083-06");
    expect(() => monthOf("2083-06-40")).toThrow(RangeError);
  });

  it("Shrawan (month 4) starts a new fiscal year", () => {
    expect(fiscalYearOf("2083-03-32")).toBe("2082/83");
    expect(fiscalYearOf("2083-04-01")).toBe("2083/84");
    expect(fiscalYearOf(TODAY)).toBe("2083/84");
    expect(fiscalYearOf("2000-01-01")).toBe("1999/00");
  });
});

describe("formatBs", () => {
  it("F-10: long form, Devanagari digits in Nepali only", () => {
    expect(formatBs(TODAY, "ne")).toBe("७ असोज २०८३");
    expect(formatBs(TODAY, "en")).toBe("7 Asoj 2083");
  });

  it("F-06: day and month for list headers", () => {
    expect(formatBs(TODAY, "ne", "dayMonth")).toBe("७ असोज");
    expect(formatBs("2083-06-06", "en", "dayMonth")).toBe("6 Asoj");
  });

  it("F-02: weekday, day and month for the Today header", () => {
    expect(formatBs(TODAY, "ne", "weekdayDayMonth")).toBe("बुधबार, ७ असोज");
    expect(formatBs(TODAY, "en", "weekdayDayMonth")).toBe("Wednesday, 7 Asoj");
  });

  it("rejects invalid dates", () => {
    expect(() => formatBs("2083-06-40", "ne")).toThrow(RangeError);
  });
});

describe("toDevanagariDigits", () => {
  it("converts every digit and leaves other text alone", () => {
    expect(toDevanagariDigits("0123456789")).toBe("०१२३४५६७८९");
    expect(toDevanagariDigits("2083-06-07 Asoj")).toBe("२०८३-०६-०७ Asoj");
  });
});

describe("supported range", () => {
  it("covers BS 2000-01-01 to 2090-12-30", () => {
    expect(BS_FIRST_DATE).toBe("2000-01-01");
    expect(BS_LAST_DATE).toBe("2090-12-30");
    expect(bsToAdMs(BS_FIRST_DATE)).toBe(Date.UTC(1943, 3, 13, 18, 15));
  });

  it("ALARM (architecture §7.2): today must be more than 2 years before the library's last date", () => {
    const twoYearsMs = 2 * 365 * 86_400_000;
    const lastSupportedMs = bsToAdMs(BS_LAST_DATE);
    // When this fails (around April 2032): upgrade nepali-date-converter or extend the table.
    expect(
      Date.now(),
      `BS calendar data ends ${BS_LAST_DATE}; update shared/dates before it runs out`,
    ).toBeLessThan(lastSupportedMs - twoYearsMs);
  });
});
