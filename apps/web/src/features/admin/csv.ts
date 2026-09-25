import { bsToAdMs } from "@mero-pasal/shared/dates";

/** One bill as the export needs it (a subset of the admin bill row). */
export type ExportBill = {
  dateBs: string;
  capturedAt: number;
  kind: "sale" | "purchase";
  partyName?: string;
  amountPaisa?: number;
  billNumber?: string;
  pages: number;
  capturedByName: string;
  status: "active" | "deleted";
};

export const CSV_HEADER = [
  "date_bs",
  "date_ad",
  "type",
  "account",
  "amount_rs",
  "bill_number",
  "photos",
  "captured_by",
  "status",
];

const adDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }); // YYYY-MM-DD

/** Exact rupees from integer paisa: 123450 → "1234.50" (no floating point). */
export function rupeesText(paisa: number): string {
  return `${Math.trunc(paisa / 100)}.${String(paisa % 100).padStart(2, "0")}`;
}

/**
 * RFC 4180 quoting; a text cell that a spreadsheet would read as a formula (= + - @) gets a
 * leading apostrophe, so a typed name can never run as one.
 */
function cell(value: string, text = true): string {
  const safe = text && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * F-14 / UC-10 CSV: oldest first, removed bills included (status "removed"), UTF-8 with a BOM
 * so Excel shows Devanagari. Amounts are rupees with 2 decimals; no amount = empty.
 */
export function billsCsv(bills: readonly ExportBill[]): string {
  const rows = [...bills].sort(
    (a, b) => a.dateBs.localeCompare(b.dateBs) || a.capturedAt - b.capturedAt,
  );
  const lines = [CSV_HEADER.join(",")];
  for (const b of rows) {
    lines.push(
      [
        cell(b.dateBs, false),
        cell(adDate.format(bsToAdMs(b.dateBs)), false),
        b.kind === "sale" ? "sold" : "bought",
        cell(b.partyName ?? ""),
        b.amountPaisa === undefined ? "" : rupeesText(b.amountPaisa),
        cell(b.billNumber ?? ""),
        String(b.pages),
        cell(b.capturedByName),
        b.status === "deleted" ? "removed" : "active",
      ].join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

export const csvFileName = (fromBs: string, toBs: string) =>
  `mero-pasal-bills-${fromBs}_${toBs}.csv`;
