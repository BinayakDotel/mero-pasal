type Totals = { billCount: number; salePaisa: number; purchasePaisa: number };
type Kind = "customer" | "supplier" | "both";

/** Label keys without placeholders, so `t(row.label)` type-checks. */
type TotalLabel =
  | "account.thisMonth"
  | "account.allTime"
  | "account.thisMonthSold"
  | "account.thisMonthBought"
  | "account.allTimeSold"
  | "account.allTimeBought";

export type ProfileRow = {
  label: TotalLabel;
  tone: "sale" | "purchase";
  paisa: number;
  /** Bills behind the amount; only when every bill of the period is on this row. */
  count?: number;
};

/**
 * F-07 profile totals: a customer's sales or a supplier's purchases for this month and all
 * time; an account that is both shows sold and bought for each (the counts cover both kinds,
 * so the split rows leave them out).
 */
export function profileTotals(kind: Kind, month: Totals, allTime: Totals): ProfileRow[] {
  if (kind === "both") {
    return [
      { label: "account.thisMonthSold", tone: "sale", paisa: month.salePaisa },
      { label: "account.thisMonthBought", tone: "purchase", paisa: month.purchasePaisa },
      { label: "account.allTimeSold", tone: "sale", paisa: allTime.salePaisa },
      { label: "account.allTimeBought", tone: "purchase", paisa: allTime.purchasePaisa },
    ];
  }
  const tone = kind === "supplier" ? "purchase" : "sale";
  const paisa = (t: Totals) => (kind === "supplier" ? t.purchasePaisa : t.salePaisa);
  return [
    { label: "account.thisMonth", tone, paisa: paisa(month), count: month.billCount },
    { label: "account.allTime", tone, paisa: paisa(allTime), count: allTime.billCount },
  ];
}

/** The name in the script it wasn't typed in, if it differs (Devanagari names get a Latin form). */
export function otherScript(account: {
  displayName: string;
  nameLatin?: string;
  nameDevanagari?: string;
}): string | undefined {
  const other =
    account.displayName === account.nameDevanagari ? account.nameLatin : account.nameDevanagari;
  return other && other !== account.displayName ? other : undefined;
}

export const KIND_LABEL = {
  customer: "account.kindCustomer",
  supplier: "account.kindSupplier",
  both: "account.kindBoth",
} as const satisfies Record<Kind, string>;
