import { expect, test } from "@playwright/test";
import { takeBill } from "./support/capture";
import { convexRunDev, E2E_USER, signInE2e } from "./support/e2e-user";

// F-07 accounts against the dev E2E shop.
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

test.describe("F-07 accounts", () => {
  test.skip(!hasClerkSecret, "Set CLERK_SECRET_KEY in apps/web/.env.local to run these");
  test.beforeAll(() => {
    convexRunDev("e2eSupport:ensureE2eShop", E2E_USER);
  });

  test("customers tab lists an account with this month's bills; search and open it", async ({
    page,
  }) => {
    await signInE2e(page);
    await takeBill(page, "40", "E2E Sita Accounts");
    await page.getByRole("link", { name: "खाता" }).click();
    await expect(page.getByRole("tab", { name: "ग्राहक", selected: true })).toBeVisible();

    await page.getByRole("searchbox").fill("सीता"); // Devanagari finds the Latin name
    const row = page.getByRole("link").filter({ hasText: "E2E Sita Accounts" });
    await expect(row).toContainText("यो महिना");
    await row.click();
    await expect(page).toHaveURL(/\/accounts\/[\w]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E Sita Accounts");
    await expect(page.getByText("यो महिना").first()).toBeVisible();
    // F-07 profile: the details card with kind and the first and last bill.
    const details = page.getByRole("region", { name: "विवरण" });
    await expect(details.getByText("प्रकार")).toBeVisible();
    await expect(details.getByText("ग्राहक", { exact: true })).toBeVisible();
    await expect(details.getByText("पछिल्लो बिल")).toBeVisible();
    await expect(page.getByRole("listitem").first()).toContainText("E2E Sita Accounts");
    await page.getByRole("button", { name: "सबै महिना" }).click();
    await expect(page.getByRole("listitem").first()).toBeVisible();
  });

  test("an account that isn't there says so instead of crashing", async ({ page }) => {
    await signInE2e(page);
    await page.goto("/accounts/not-an-account");
    await expect(page.getByText("यो भेटिएन। हटाइएको हुन सक्छ।")).toBeVisible();
  });
});
