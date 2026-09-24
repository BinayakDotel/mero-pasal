import { ConvexError } from "convex/values";

// Architecture §6 error contract. The UI maps each code to an i18n message (`error.<CODE>`).
export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "CONFLICT",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
/**
 * Optional detail for the phone's outbox: NOT_EDITABLE = this bill can never be changed by this
 * member (not theirs, or past the staff 24 h window), so it's a rejection, not a sign-in pause.
 */
export type ErrorReason = "NOT_EDITABLE";
export type AppErrorData = { code: ErrorCode; message?: string; reason?: ErrorReason };

/** Builds the only kind of error our functions throw: `throw appError("FORBIDDEN")`. */
export function appError(
  code: ErrorCode,
  message?: string,
  reason?: ErrorReason,
): ConvexError<AppErrorData> {
  return new ConvexError({
    code,
    ...(message === undefined ? {} : { message }),
    ...(reason === undefined ? {} : { reason }),
  });
}
