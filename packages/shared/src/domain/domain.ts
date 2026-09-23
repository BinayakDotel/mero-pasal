// Shared domain constants. The Convex schema defines the matching validators; a backend test
// asserts they stay in sync (shared cannot import backend: architecture §4).

/** Every kind of money event in `transactions` (ADR-006). v1.0 captures only sale and purchase. */
export const TX_KINDS = [
  "sale",
  "purchase",
  "payment_in",
  "payment_out",
  "opening_balance",
  "adjustment",
] as const;
export type TxKind = (typeof TX_KINDS)[number];

/** The kinds the UI calls "bills" (बिल). */
export const BILL_KINDS = ["sale", "purchase"] as const satisfies readonly TxKind[];
export type BillKind = (typeof BILL_KINDS)[number];

export const ROLES = ["owner", "admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const LOCALES = ["ne", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** F-03: a multi-page supplier invoice has at most this many photos. */
export const MAX_BILL_PAGES = 5;

/** F-03: amounts at or above this ask "रु X — ठीक हो?" once (रु 5,00,000). */
export const LARGE_AMOUNT_CONFIRM_PAISA = 50_000_000;

/** F-05: the date picker goes at most this many days back. */
export const MAX_BACKDATE_DAYS = 90;

/** Architecture §5.3 invariant 6: the server rejects bills dated further ahead than this. */
export const MAX_FUTURE_DAYS = 1;

/** F-08: how long the Undo toast stays after removing a bill. */
export const UNDO_WINDOW_MS = 6_000;

/** F-08: staff may correct or remove their own bills only within this window. */
export const STAFF_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
