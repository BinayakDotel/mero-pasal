import { defineConfig } from "vitest/config";

// Unit tests for pure web logic (reducers, helpers). Screens are covered by Playwright (e2e/).
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
