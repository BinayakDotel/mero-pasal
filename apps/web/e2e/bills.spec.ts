import { expect, test } from "@playwright/test";
import { convexRunDev, E2E_USER, signInE2e } from "./support/e2e-user";

// F-06 Bills list against the dev E2E shop (its bills come from the offline-sync spec, all sales).
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

test.describe("F-06 bills list", () => {
  test.skip(!hasClerkSecret, "Set CLERK_SECRET_KEY in apps/web/.env.local to run these");
  test.beforeAll(() => {
    convexRunDev("e2eSupport:ensureE2eShop", E2E_USER);
  });

  test("filters by type and opens a bill by its clientId", async ({ page }) => {
    await signInE2e(page);
    await page.getByRole("link", { name: "बिलहरू" }).click();
    await expect(page.getByRole("heading", { name: "बिलहरू", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "किनेको" }).click();
    await expect(page.getByText("यहाँ कुनै बिल छैन।")).toBeVisible();

    await page.getByRole("button", { name: "बेचेको" }).click();
    const first = page.getByRole("listitem").first().getByRole("link");
    await expect(first).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/\/bills\/[\w-]+$/);
  });
});
