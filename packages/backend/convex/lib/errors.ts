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
export type AppErrorData = { code: ErrorCode; message?: string };

/** Builds the only kind of error our functions throw: `throw appError("FORBIDDEN")`. */
export function appError(code: ErrorCode, message?: string): ConvexError<AppErrorData> {
  return new ConvexError(message === undefined ? { code } : { code, message });
}
