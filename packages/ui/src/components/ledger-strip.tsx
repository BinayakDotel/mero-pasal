import type { ReactNode } from "react";

export type LedgerTone = "sale" | "purchase" | "udharo";
export type LedgerRow = {
  label: string;
  tone: LedgerTone;
  /** Usually an <AmountText />, right-aligned like a ledger column. */
  value: ReactNode;
  /** e.g. "12 बिल"; already translated. */
  count?: string;
  /** Marigold "needs attention" row (ui-ux §5.1: bills without an amount). */
  warn?: boolean;
};

const DOT: Record<LedgerTone, string> = {
  sale: "bg-sale",
  purchase: "bg-buy",
  udharo: "bg-udharo",
};

/** Money summary on ruled lines with the red bahi margin (ui-ux §3.4, ADR-022). */
export function LedgerStrip({ heading, rows }: { heading: string; rows: readonly LedgerRow[] }) {
  return (
    <section className="ledger pr-3.5" aria-label={heading}>
      <h2 className="flex h-12 items-center font-display text-lg font-bold text-ink-soft">
        {heading}
      </h2>
      <dl>
        {rows.map((row) => (
          <div key={row.label} className="flex h-12 items-center justify-between gap-2.5">
            <dt
              className={`flex items-center gap-2 font-semibold ${row.warn ? "text-udharo-ink" : ""}`}
            >
              <span
                className={`size-2.5 flex-none rounded-full ${DOT[row.tone]}`}
                aria-hidden="true"
              />
              {row.label}
            </dt>
            <dd className="flex items-baseline gap-2">
              <span className="text-[23px]">{row.value}</span>
              {row.count === undefined ? null : (
                <span className="min-w-13 text-right text-[15px] text-ink-soft">{row.count}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
