import { expect, test } from "@playwright/test";
import { pickOrAddName, takeBill } from "./support/capture";
import { convexRunDev, E2E_USER, signInE2e } from "./support/e2e-user";

// F-08 correct (UC-08 shape) against the dev E2E shop.
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

test.describe("F-08 correct a bill", () => {
  test.skip(!hasClerkSecret, "Set CLERK_SECRET_KEY in apps/web/.env.local to run these");
  test.beforeAll(() => {
    convexRunDev("e2eSupport:ensureE2eShop", E2E_USER);
  });

  test("move a bill to another account and change its amount", async ({ page }) => {
    const run = Date.now().toString(36);
    const from = `E2E Gurung ${run}`;
    const to = `E2E Shrestha ${run}`;
    await signInE2e(page);
    await takeBill(page, "30", from);
    await page.getByRole("listitem").filter({ hasText: from }).first().getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(from);

    await page.getByRole("button", { name: "सच्याउनुहोस्" }).click();
    await pickOrAddName(page, to);
    await page.getByRole("button", { name: "मेटाउनुहोस्" }).click();
    await page.getByRole("button", { name: "मेटाउनुहोस्" }).click();
    await page.getByRole("button", { name: "4", exact: true }).click();
    await page.getByRole("button", { name: "5", exact: true }).click();
    await page.getByRole("button", { name: "सच्याउनुहोस्" }).click();

    await expect(page.getByRole("status")).toHaveText("सच्याइयो");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(to);
    await expect(page.getByText("रु 45")).toBeVisible();
  });
});
