import {
  type BsFormatStyle,
  type DateBs,
  type DateLocale,
  formatBs,
} from "@mero-pasal/shared/dates";

/** A BS date as text: "७ असोज २०८३" / "7 Asoj 2083" (F-10). Machine-readable in `data-date-bs`. */
export function BsDateText({
  dateBs,
  locale,
  style = "long",
  className = "",
}: {
  dateBs: DateBs;
  locale: DateLocale;
  style?: BsFormatStyle;
  className?: string;
}) {
  return (
    <span className={className} data-date-bs={dateBs}>
      {formatBs(dateBs, locale, style)}
    </span>
  );
}
