import { phoneticKey } from "@mero-pasal/shared/names";
import { describe, expect, it } from "vitest";
import type { PickerParty } from "@/features/capture/use-picker-parties";
import { accountRows, type MonthTotal } from "./account-rows";

const party = (id: string, name: string, lastUsedAt: number) =>
  ({
    _id: id,
    clientId: `c-${id}`,
    kind: "customer",
    displayName: name,
    phoneticKey: phoneticKey(name),
    isWalkIn: false,
    lastUsedAt,
  }) as PickerParty;

const parties = [
  party("p1", "Hari", 1),
  party("p2", "Sita", 3),
  party("p3", "Ram", 2),
  party("local:c9", "Gita", 9),
];
const totals = new Map<string, MonthTotal>([
  ["p1", { billCount: 2, salePaisa: 500, purchasePaisa: 0 }],
  ["p3", { billCount: 1, salePaisa: 900, purchasePaisa: 0 }],
]);

describe("accountRows (F-07)", () => {
  it("busiest this month first, then most recently used; phone-only names marked", () => {
    const rows = accountRows(parties, totals, "customers", "");
    expect(rows.map((r) => [r.party.displayName, r.monthPaisa, r.local])).toEqual([
      ["Ram", 900, false],
      ["Hari", 500, false],
      ["Gita", 0, true],
      ["Sita", 0, false],
    ]);
  });

  it("suppliers count purchases; search uses the name match", () => {
    expect(accountRows(parties, totals, "suppliers", "")[0]?.monthPaisa).toBe(0);
    expect(accountRows(parties, totals, "customers", "सीता").map((r) => r.party._id)).toEqual([
      "p2",
    ]);
  });
});
