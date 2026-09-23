import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // The dates tests use nepali-date-converter as a reference, and its conversions read the
    // host's local time (in Pacific/Kiritimati it skips 1994-12-31). Our code uses UTC only;
    // pinning the reference to the phone's zone keeps the oracle trustworthy.
    env: { TZ: "Asia/Kathmandu" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__fixtures__/**"],
      // code-standard §4: dates, money, names and ledger target 100% branch coverage.
      thresholds: {
        "src/money/**": { 100: true },
        "src/dates/**": { 100: true },
        "src/names/**": { 100: true },
        "src/ledger/**": { 100: true },
      },
    },
  },
});
