import { isValidBs } from "@mero-pasal/shared/dates";
import { appError } from "./errors";

/** A BS month "YYYY-MM" that exists (its first day is a real BS date), else VALIDATION. */
export function assertMonthBs(monthBs: string): void {
  if (!/^\d{4}-\d{2}$/.test(monthBs) || !isValidBs(`${monthBs}-01`)) {
    throw appError("VALIDATION", "monthBs must be a real YYYY-MM BS month");
  }
}
