import { expect, test } from "@playwright/test";
import { saleButton, takeBill } from "./support/capture";
import { convexRunDev, E2E_USER, signInE2e } from "./support/e2e-user";

// F-08 remove (UC-07 shape) against the dev E2E shop.
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

test.describe("F-08 remove a bill", () => {
  test.skip(!hasClerkSecret, "Set CLERK_SECRET_KEY in apps/web/.env.local to run these");
  test.beforeAll(() => {
    convexRunDev("e2eSupport:ensureE2eShop", E2E_USER);
  });

  test("confirm, undo within 6 s, remove again: the bill leaves Today", async ({ page }) => {
    const name = `E2E Dup ${Date.now().toString(36)}`;
    await signInE2e(page);
    await takeBill(page, "60", name);
    const row = page.getByRole("listitem").filter({ hasText: name });
    await row.first().getByRole("link").click();

    await page.getByRole("button", { name: "हटाउनुहोस्" }).click();
    await expect(page.getByText("हटाएको बिल हिसाबमा गनिँदैन।", { exact: false })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "हटाउनुहोस्" }).click();
    const toast = page
      .getByRole("status")
      .filter({ has: page.getByRole("button", { name: "फर्काउनुहोस्" }) });
    await expect(toast).toContainText("हटाइयो");
    await page.getByRole("button", { name: "फर्काउनुहोस्" }).click();
    await expect(page.getByRole("button", { name: "सच्याउनुहोस्" })).toBeVisible();

    await page.getByRole("button", { name: "हटाउनुहोस्" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "हटाउनुहोस्" }).click();
    await expect(saleButton(page)).toBeVisible({ timeout: 10_000 }); // back on Today after 6 s
    await expect(row).toHaveCount(0);
  });
});
