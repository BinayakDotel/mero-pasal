import { defineConfig, devices } from "@playwright/test";

// Local secrets for the web server and the auth-dependent tests (Node 24 loadEnvFile).
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI): auth-dependent tests skip themselves.
}

const PORT = 3100;

// code-standard §7: mobile viewport 393×851 (Redmi 15C class). The production build is used so
// the service worker and manifest behave as they will on the phone.
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    viewport: { width: 393, height: 851 },
    locale: "ne-NP",
    timezoneId: "Asia/Kathmandu",
  },
  projects: [{ name: "mobile-chrome", use: { browserName: "chromium" } }],
  webServer: {
    command: `pnpm run build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/manifest.webmanifest`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
