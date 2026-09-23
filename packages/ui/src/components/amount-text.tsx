import { formatNpr, type MoneyLocale } from "@mero-pasal/shared/money";

/** Money on screen: `रु 1,23,456` / `Rs 1,23,456`, tabular digits (F-10, ADR-026). */
export function AmountText({
  paisa,
  locale,
  className = "",
}: {
  paisa: number;
  locale: MoneyLocale;
  className?: string;
}) {
  return (
    <span className={`font-display font-bold tabular-nums ${className}`}>
      {formatNpr(paisa, { locale })}
    </span>
  );
}
