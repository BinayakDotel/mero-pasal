import { bsToAdMs } from "@mero-pasal/shared/dates";
import { describe, expect, it } from "vitest";
import { billsCsv, csvFileName, type ExportBill, rupeesText } from "./csv";

const bill = (extra: Partial<ExportBill>): ExportBill => ({
  dateBs: "2083-06-01",
  capturedAt: 1,
  kind: "sale",
  pages: 1,
  capturedByName: "Buwa",
  status: "active",
  ...extra,
});

describe("bills CSV export (F-14, UC-10)", () => {
  it("rupees are exact, from integer paisa", () => {
    expect(rupeesText(123_450)).toBe("1234.50");
    expect(rupeesText(5)).toBe("0.05");
    expect(rupeesText(0)).toBe("0.00");
  });

  it("has a BOM and header; oldest first; removed bills included", () => {
    const csv = billsCsv([
      bill({ dateBs: "2083-06-02", amountPaisa: 45_000, partyName: "राम थापा", status: "deleted" }),
      bill({ dateBs: "2083-06-01", capturedAt: 2, kind: "purchase", billNumber: "77", pages: 2 }),
    ]);
    expect(csv.startsWith("﻿date_bs,date_ad,type,account,amount_rs,")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^2083-06-01,\d{4}-\d{2}-\d{2},bought,,,77,2,Buwa,active$/);
    expect(lines[2]).toMatch(
      /^2083-06-02,\d{4}-\d{2}-\d{2},sold,राम थापा,450\.00,,1,Buwa,removed$/,
    );
  });

  it("the AD date is the same day in Nepal", () => {
    const ad = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(
      bsToAdMs("2083-06-01"),
    );
    expect(billsCsv([bill({})]).split("\r\n")[1]).toContain(`,${ad},`);
  });

  it("quotes commas, quotes and newlines; never lets a name run as a formula", () => {
    const line = billsCsv([
      bill({
        partyName: 'Ram "Chowk", Thapa',
        billNumber: "=HYPERLINK(1)",
        capturedByName: "A\nB",
      }),
    ]).split("\r\n")[1];
    expect(line).toContain(`"Ram ""Chowk"", Thapa"`);
    expect(line).toContain(`'=HYPERLINK(1)`);
    expect(line).toContain(`"A\nB"`);
  });

  it("names the file by the BS range", () => {
    expect(csvFileName("2083-06-01", "2083-06-30")).toBe(
      "mero-pasal-bills-2083-06-01_2083-06-30.csv",
    );
  });
});
