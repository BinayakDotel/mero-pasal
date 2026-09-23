import { defineConfig } from "vitest/config";

// convex-test runs Convex functions in the edge runtime (docs.convex.dev/testing/convex-test).
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
