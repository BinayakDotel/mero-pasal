import { describe, expect, it } from "vitest";
import { otherScript, profileTotals } from "./profile";

const month = { billCount: 3, salePaisa: 500, purchasePaisa: 200 };
const all = { billCount: 9, salePaisa: 1_500, purchasePaisa: 700 };

describe("account profile (F-07)", () => {
  it("a customer shows sales with counts; a supplier shows purchases", () => {
    expect(profileTotals("customer", month, all)).toEqual([
      { label: "account.thisMonth", tone: "sale", paisa: 500, count: 3 },
      { label: "account.allTime", tone: "sale", paisa: 1_500, count: 9 },
    ]);
    expect(profileTotals("supplier", month, all).map((r) => r.paisa)).toEqual([200, 700]);
  });

  it("an account that is both shows sold and bought, never hiding purchases", () => {
    expect(profileTotals("both", month, all)).toEqual([
      { label: "account.thisMonthSold", tone: "sale", paisa: 500 },
      { label: "account.thisMonthBought", tone: "purchase", paisa: 200 },
      { label: "account.allTimeSold", tone: "sale", paisa: 1_500 },
      { label: "account.allTimeBought", tone: "purchase", paisa: 700 },
    ]);
  });

  it("the other script: Latin for a Devanagari name, nothing when there's none", () => {
    expect(otherScript({ displayName: "हरि", nameDevanagari: "हरि", nameLatin: "hari" })).toBe(
      "hari",
    );
    expect(otherScript({ displayName: "Hari", nameLatin: "Hari" })).toBeUndefined();
    expect(otherScript({ displayName: "Hari" })).toBeUndefined(); // an older cached copy
  });
});
