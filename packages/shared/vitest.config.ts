import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
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
