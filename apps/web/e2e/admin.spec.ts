import { expect, test } from "@playwright/test";
import { convexRunDev, E2E_USER, signInE2e } from "./support/e2e-user";

// F-11 admin console against the dev E2E shop (the test user is its admin).
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

test.use({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false });

test.describe("F-11 admin console", () => {
  test.skip(!hasClerkSecret, "Set CLERK_SECRET_KEY in apps/web/.env.local to run these");
  test.beforeAll(() => {
    convexRunDev("e2eSupport:ensureE2eShop", E2E_USER);
  });

  test("an admin gets the console with its sections", async ({ page }) => {
    await signInE2e(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
    for (const name of ["Bills", "Accounts", "Members", "Export"]) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("the overview loads this month, the queue, duplicates and sync health", async ({ page }) => {
    await signInE2e(page);
    await page.goto("/admin");
    for (const title of [/^Needs attention/, /^Possible duplicates/, /^Members/]) {
      await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
    }
    await expect(page.getByRole("combobox", { name: "Month" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Sold", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "E2E", exact: true })).toBeVisible();
  });
});
