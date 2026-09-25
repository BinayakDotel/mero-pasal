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

  test("the bills table filters by type and date, and j selects a row", async ({ page }) => {
    await signInE2e(page);
    await page.goto("/admin/bills");
    await expect(page.getByRole("heading", { name: "Bills", level: 1 })).toBeVisible();
    const rows = page.locator("tbody tr[aria-selected]");
    await expect(rows.first()).toBeVisible({ timeout: 15_000 }); // the E2E shop has bills
    await page.getByRole("button", { name: "Sold", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sold", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(rows.first().getByRole("cell", { name: "Sold", exact: true })).toBeVisible();

    await page.getByRole("textbox", { name: "From (BS)" }).fill("2083-13"); // half typed
    await expect(rows.first()).toBeVisible(); // the table keeps its last range
    await page.getByRole("textbox", { name: "From (BS)" }).fill("");

    await page.getByRole("textbox", { name: "From (BS)" }).blur(); // j/k only while not typing
    await page.keyboard.press("j");
    await expect(rows.first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("j");
    await page.keyboard.press("k");
    await expect(rows.first()).toHaveAttribute("aria-selected", "true");
  });
});
