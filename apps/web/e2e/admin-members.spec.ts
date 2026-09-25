import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { saleButton } from "./support/capture";
import {
  convexRunDev,
  E2E_USER,
  ensureClerkTestUser,
  signInAs,
  signInE2e,
} from "./support/e2e-user";

// F-13 / ADR-034 end to end: the admin invites an email; that person's first Google sign-in
// links the invite (a verified email in the Clerk session token) and they land in the app.
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);
const INVITEE = "mp-invitee+clerk_test@example.com";

test.use({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false });

test.describe("F-13 members and invites", () => {
  test.skip(!hasClerkSecret, "Set CLERK_SECRET_KEY in apps/web/.env.local to run these");
  test.beforeAll(async () => {
    convexRunDev("e2eSupport:ensureE2eShop", E2E_USER);
    convexRunDev("e2eSupport:resetE2eInvite", { email: INVITEE }); // a fresh invite every run
    await ensureClerkTestUser(INVITEE);
  });

  test("invite by email → first sign-in links it → they're a member", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await signInE2e(page);
    await page.goto("/admin/members");
    await expect(page.getByRole("combobox", { name: "Role of E2E" })).toBeDisabled(); // self

    await page.getByRole("textbox", { name: "Email" }).fill(INVITEE);
    await page.getByRole("textbox", { name: "Name" }).fill("Invitee");
    await page.getByRole("button", { name: "Invite" }).click();
    await expect(page.getByRole("status")).toContainText(`Invited ${INVITEE}`);
    const row = page.getByRole("row", { name: /Invitee/ });
    await expect(row.getByRole("cell", { name: "invited", exact: true })).toBeVisible();

    // The invitee, on their own phone.
    const theirs = await browser.newContext(baseURL ? { baseURL } : {});
    const phone = await theirs.newPage();
    await setupClerkTestingToken({ page: phone });
    await signInAs(phone, INVITEE);
    await expect(saleButton(phone)).toBeVisible({ timeout: 30_000 });
    expect(phone.url()).not.toContain("/not-invited");
    await theirs.close();

    // The admin sees them linked (no longer "invited").
    await expect(row.getByRole("cell", { name: "invited", exact: true })).toHaveCount(0, {
      timeout: 15_000,
    });

    // Deactivate: their access ends; reactivate brings it back.
    page.once("dialog", (dialog) => void dialog.accept());
    await row.getByRole("button", { name: "Deactivate" }).click();
    await expect(row.getByRole("cell", { name: "deactivated", exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Reactivate" }).click();
    await expect(row.getByRole("button", { name: "Deactivate" })).toBeVisible();
  });
});
