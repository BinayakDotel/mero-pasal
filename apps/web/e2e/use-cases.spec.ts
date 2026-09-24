import { expect, type Page, test } from "@playwright/test";
import { pickOrAddName, saleButton, takeBill } from "./support/capture";
import { convexRunDev, E2E_USER, signInE2e } from "./support/e2e-user";

// M3 exit (progress tracker): UC-07 and UC-08 end to end against the dev E2E shop.
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

async function openAccount(page: Page, name: string) {
  await page.getByRole("link", { name: "खाता" }).click();
  await page.getByRole("searchbox").fill(name);
  await page.getByRole("link").filter({ hasText: name }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
}
const thisMonth = (page: Page) => page.getByRole("region").getByRole("definition").first();

test.describe("M3 use cases", () => {
  test.skip(!hasClerkSecret, "Set CLERK_SECRET_KEY in apps/web/.env.local to run these");
  test.beforeAll(() => {
    convexRunDev("e2eSupport:ensureE2eShop", E2E_USER);
  });

  test("UC-07: a customer disputes a bill → find it from खाता → remove the duplicate", async ({
    page,
  }) => {
    test.setTimeout(90_000); // two bills, then the 6 s undo window
    const hari = `E2E Hari ${Date.now().toString(36)}`;
    await signInE2e(page);
    await takeBill(page, "50", hari);
    await takeBill(page, "50", hari);

    // Today → खाता (1 tap) → type → the account (2 taps): "this month shows 2 bills".
    await openAccount(page, hari);
    await expect(thisMonth(page)).toContainText("2 बिल");

    await page.getByRole("listitem").first().getByRole("link").click();
    await page.getByRole("button", { name: "हटाउनुहोस्" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "हटाउनुहोस्" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(hari, { timeout: 10_000 });
    await expect(thisMonth(page)).toContainText("1 बिल", { timeout: 15_000 });
  });

  test("UC-08: bill under the wrong Sita → corrected with the internet gone → both accounts move", async ({
    context,
    page,
  }) => {
    test.setTimeout(90_000);
    const run = Date.now().toString(36);
    const wrong = `E2E Sita Gurung ${run}`;
    const right = `E2E Sita Shrestha ${run}`;
    await signInE2e(page);
    await takeBill(page, "70", right);
    await takeBill(page, "80", wrong);
    await page.getByRole("listitem").filter({ hasText: wrong }).first().getByRole("link").click();

    await context.setOffline(true);
    await page.getByRole("button", { name: "सच्याउनुहोस्" }).click();
    await pickOrAddName(page, right);
    await page.getByRole("button", { name: "सच्याउनुहोस्" }).click();
    await expect(page.getByRole("status")).toHaveText("सच्याइयो");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(right);

    await context.setOffline(false);
    await page.getByRole("button", { name: "पछाडि" }).click();
    await expect(saleButton(page)).toBeVisible();
    await openAccount(page, right);
    await expect(thisMonth(page)).toContainText("2 बिल", { timeout: 30_000 });
    await openAccount(page, wrong);
    await expect(thisMonth(page)).toContainText("0 बिल", { timeout: 30_000 });
  });
});
