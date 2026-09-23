// All money is integer paisa (ADR-007). No floating-point arithmetic on money anywhere:
// sums stay in paisa, and rupees exist only at the edges (number pad input, display).

export type MoneyLocale = "ne" | "en";

const PAISA_PER_RUPEE = 100;

// Latin digits with lakh grouping in both locales (F-10: Buwa reads a calculator).
const lakhGrouping = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

const CURRENCY_PREFIX: Record<MoneyLocale, string> = {
  ne: "रु",
  en: "Rs",
};

/** Throws unless `paisa` is a safe integer (architecture §5.3 invariant 5). */
export function assertPaisa(paisa: number): void {
  if (!Number.isSafeInteger(paisa)) {
    throw new RangeError(`Money must be an integer number of paisa, got ${paisa}`);
  }
}

/** Converts whole rupees from the number pad to paisa. v1 accepts whole rupees only (ADR-007). */
export function rupeesToPaisa(rupees: number): number {
  if (!Number.isSafeInteger(rupees)) {
    throw new RangeError(`Rupees must be a whole number, got ${rupees}`);
  }
  const paisa = rupees * PAISA_PER_RUPEE;
  assertPaisa(paisa);
  return paisa;
}

/** Converts paisa to rupees for display or for prefilling an edit; never do arithmetic on the result. */
export function paisaToRupees(paisa: number): number {
  assertPaisa(paisa);
  return paisa / PAISA_PER_RUPEE;
}

/** Sums paisa amounts exactly; throws if any input or the total is not a safe integer. */
export function sumPaisa(amounts: readonly number[]): number {
  let total = 0;
  for (const amount of amounts) {
    assertPaisa(amount);
    total += amount;
  }
  assertPaisa(total);
  return total;
}

/**
 * Formats paisa as `रु 1,23,456` (ne) or `Rs 1,23,456` (en). Paisa are shown only when
 * non-zero (`रु 2,340.50`). Negative amounts get a leading minus: `-रु 1,200`.
 */
export function formatNpr(paisa: number, { locale }: { locale: MoneyLocale }): string {
  assertPaisa(paisa);
  const sign = paisa < 0 ? "-" : "";
  const abs = Math.abs(paisa);
  const rupees = Math.trunc(abs / PAISA_PER_RUPEE);
  const remainder = abs % PAISA_PER_RUPEE;
  const fraction = remainder === 0 ? "" : `.${String(remainder).padStart(2, "0")}`;
  return `${sign}${CURRENCY_PREFIX[locale]} ${lakhGrouping.format(rupees)}${fraction}`;
}
