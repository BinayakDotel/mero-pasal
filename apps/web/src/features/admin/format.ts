import { formatNpr } from "@mero-pasal/shared/money";

// Admin display formats (English console, ADR-034). Times are always Nepal time (NPT).

export const rs = (paisa: number) => formatNpr(paisa, { locale: "en" });

const dayTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kathmandu",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const time = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kathmandu",
  hour: "2-digit",
  minute: "2-digit",
});

/** "25 Sept, 14:05" NPT, or "—". */
export const whenNpt = (ms: number | undefined) => (ms === undefined ? "—" : dayTime.format(ms));

/** "14:05" NPT. */
export const timeNpt = (ms: number) => time.format(ms);
