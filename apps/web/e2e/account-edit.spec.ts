import { expect, test } from "@playwright/test";
import { convexRunDev, E2E_USER, signInE2e } from "./support/e2e-user";

// F-07 / ADR-036: the owner (here the E2E admin) corrects an account from its page on the phone.
// Each run edits accounts of its own (seedAdminFixture), never ones other tests use.
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

type Fixture = { partyId: string; partyName: string; clientId: string };
const token = () =>
  Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join(
    "",
  );

test.describe("F-07 edit an account on the phone", () => {
  test.skip(!hasClerkSecret, "Set CLERK_SECRET_KEY in apps/web/.env.local to run these");
  test.beforeAll(() => {
    convexRunDev("e2eSupport:ensureE2eShop", E2E_USER);
  });

  test("rename, tag and kind; a close name asks first; offline says it needs the internet", async ({
    page,
    context,
  }) => {
    const own = convexRunDev<Fixture>("e2eSupport:seedAdminFixture", { token: token() });
    const other = convexRunDev<Fixture>("e2eSupport:seedAdminFixture", { token: token() });
    await signInE2e(page);
    await page.goto(`/accounts/${own.partyId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(own.partyName);

    // Rename it to the other account's name: the sheet asks before saving.
    await page.getByRole("button", { name: "सच्याउनुहोस्" }).click();
    const sheet = page.getByRole("dialog", { name: "खाता सच्याउनुहोस्" });
    const name = sheet.getByRole("textbox", { name: "नाम" });
    await name.fill(other.partyName);
    await expect(sheet.getByText("यस्तै नाम पहिले नै छ")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "राख्नुहोस्" })).toBeDisabled();

    // A new name, a tag and "both": saved, and the page shows it at once.
    const renamed = `Edited ${token()}`;
    await name.fill(renamed);
    await sheet.getByRole("textbox", { name: "चिनाउने शब्द (नभए खाली)" }).fill("चोक");
    await sheet.getByRole("button", { name: "ग्राहक र सप्लायर दुवै" }).click();
    await sheet.getByRole("button", { name: "राख्नुहोस्" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(renamed);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("चोक");
    const details = page.getByRole("region", { name: "विवरण" });
    await expect(details.getByText("ग्राहक र सप्लायर दुवै")).toBeVisible();
    await expect(page.getByText("जम्मा बेचेको")).toBeVisible(); // both sides now

    // Offline: the sheet explains, and nothing can be saved.
    await context.setOffline(true);
    await page.getByRole("button", { name: "सच्याउनुहोस्" }).click();
    await expect(sheet.getByText(/सच्याउन इन्टरनेट चाहिन्छ/)).toBeVisible();
    await sheet.getByRole("textbox", { name: "नाम" }).fill(`${renamed} x`);
    await expect(sheet.getByRole("button", { name: "राख्नुहोस्" })).toBeDisabled();
    await context.setOffline(false);
  });
});
