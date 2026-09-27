import { expect, type Page, test } from "@playwright/test";
import { convexRunDev, E2E_USER, signInE2e } from "./support/e2e-user";

// F-12 delete (ADR-037) against the dev E2E shop (the test user is its admin). Each test deletes an
// account of its own (seedAdminFixture), never one other tests use.
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

type Fixture = { partyId: string; partyName: string; clientId: string };
const token = () =>
  Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join(
    "",
  );
const fixture = (bills: number) =>
  convexRunDev<Fixture>("e2eSupport:seedAdminFixture", { token: token(), bills });

async function openProfile(page: Page, own: Fixture, bills: number) {
  await page.goto(`/admin/accounts/${own.partyId}`);
  await expect(page.getByRole("heading", { name: own.partyName, level: 1 })).toBeVisible();
  await expect(page.locator("tbody tr[aria-selected]")).toHaveCount(bills, { timeout: 15_000 });
}

test.use({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false });

test.describe("F-12 delete an account", () => {
  test.skip(!hasClerkSecret, "Set CLERK_SECRET_KEY in apps/web/.env.local to run these");
  test.beforeAll(() => {
    convexRunDev("e2eSupport:ensureE2eShop", E2E_USER);
  });

  test("deletes with its bill, leaves the lists and the phone says so; Bring back undoes it", async ({
    page,
  }) => {
    const own = fixture(1);
    await signInE2e(page);
    await openProfile(page, own, 1);

    await page.getByRole("button", { name: "Delete account", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete account" });
    await expect(dialog.getByText(/Its 1 bill \(Rs 123 sold, Rs 0 bought\)/)).toBeVisible();
    await expect(dialog.getByRole("textbox")).toHaveCount(0); // under 10 bills: nothing to type
    await dialog.getByRole("button", { name: "Delete account and 1 bill" }).click();
    await expect(dialog).toHaveCount(0);

    // Deleted: the notice, no edit, and its bill is removed (still listed for the admin).
    const notice = page.getByRole("status").filter({ hasText: "Deleted" });
    await expect(notice).toContainText("1 bill was removed with it", { timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Edit, archive or merge" })).toHaveCount(0);
    await expect(page.locator("tbody tr[aria-selected]").first()).toContainText("removed");

    // Gone from the accounts list unless asked for.
    await page.goto("/admin/accounts");
    await page.getByRole("textbox", { name: "Search accounts" }).fill(own.partyName);
    await expect(page.getByRole("link", { name: own.partyName, exact: true })).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Deleted" }).check();
    const row = page.locator("tbody tr").filter({ hasText: own.partyName });
    await expect(row.getByRole("cell", { name: "deleted", exact: true })).toBeVisible();

    // The phone's account page says it was deleted, and offers no edit.
    await page.goto(`/accounts/${own.partyId}`);
    await expect(page.getByText("यो खाता बिलहरूसहित हटाइएको छ")).toBeVisible();
    await expect(page.getByRole("button", { name: "सच्याउनुहोस्" })).toHaveCount(0);

    // Bring back: the account and its bill return.
    await openProfile(page, own, 1);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Bring back" }).click();
    await expect(page.getByText("Active", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("tbody tr[aria-selected]").first()).not.toContainText("removed");
    const totals = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Totals" }) });
    await expect(totals.getByRole("row", { name: /All time/ })).toContainText("Rs 123");
  });

  test("from 10 bills on, the name must be typed first", async ({ page }) => {
    const own = fixture(10);
    await signInE2e(page);
    await openProfile(page, own, 10);
    await page.getByRole("button", { name: "Delete account", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete account" });
    const confirm = dialog.getByRole("button", { name: "Delete account and 10 bills" });
    await expect(confirm).toBeDisabled();
    const name = dialog.getByRole("textbox", { name: /to confirm/ });
    await name.fill("Admin");
    await expect(confirm).toBeDisabled();
    await name.fill(`  ${own.partyName.toUpperCase()} `); // case and spaces don't matter
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByRole("status").filter({ hasText: "Deleted" })).toContainText(
      "10 bills were removed with it",
      { timeout: 15_000 },
    );
  });
});
