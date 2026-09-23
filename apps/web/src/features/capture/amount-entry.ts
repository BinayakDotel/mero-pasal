import { rupeesToPaisa } from "@mero-pasal/shared/money";
import type { NumPadKey } from "@mero-pasal/ui/components/num-pad";

// F-03 amount pad input (ADR-007): whole rupees only, typed like a calculator. The draft keeps
// the digits; money becomes integer paisa only through the shared helper.

/** रु 99,99,99,999 — far above any bill, well inside safe integers. */
export const MAX_AMOUNT_DIGITS = 9;

export function pressKey(digits: string, key: NumPadKey): string {
  if (digits === "" && (key === "0" || key === "00")) return digits; // no leading zeros
  const next = digits + key;
  return next.length > MAX_AMOUNT_DIGITS ? digits : next;
}

export function backspace(digits: string): string {
  return digits.slice(0, -1);
}

/** undefined = "रकम पछि हाल्छु" (no amount entered). */
export function digitsToPaisa(digits: string): number | undefined {
  return digits === "" ? undefined : rupeesToPaisa(Number(digits));
}
