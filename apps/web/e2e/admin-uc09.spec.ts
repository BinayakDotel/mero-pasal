import { expect, test } from "@playwright/test";
import { convexRunDev, E2E_USER, signInE2e } from "./support/e2e-user";

// UC-09 (M4 exit): Binayak cleans up. He gives a bill its amount, gives a bill a name, and
// merges a duplicate account: 17 bills move to the kept account and nothing is deleted.
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

type Seed = { keepId: string; mergeId: string; keepName: string; mergeName: string };
type PartyBills = { id: string; bills: number; billCount: number; mergedIntoId: string | null };

const letters = () =>
  Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join(
    "",
  );

test.use({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false });

test.describe("UC-09 clean up and merge", () => {
  test.skip(!hasClerkSecret, "Set CLERK_SECRET_KEY in apps/web/.env.local to run these");

  test("fix an amount, name a bill, merge a duplicate: 17 bills move, none deleted", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    convexRunDev("e2eSupport:ensureE2eShop", E2E_USER);
    const rupees = 7000 + Math.floor(Math.random() * 1000); // finds the nameless bill's row
    const seed = convexRunDev<Seed>("e2eSupport:seedUc09", {
      token: letters(),
      phone: `98${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
      noNamePaisa: rupees * 100,
    });

    await signInE2e(page);
    await page.goto("/admin");
    const queue = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /^Needs attention/ }) });

    // 1. The bill without an amount: type it from the photo.
    // (By the account cell: a nameless row's picker also lists this name.)
    const noAmount = queue
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: seed.keepName, exact: true }) });
    await noAmount.getByRole("textbox", { name: "Amount in rupees" }).fill("250");
    await noAmount.getByRole("button", { name: "Save" }).click();
    await expect(noAmount).toHaveCount(0);

    // 2. The bill without a name: pick the account.
    const shown = `Rs ${rupees.toLocaleString("en-US")}`;
    const noName = queue.getByRole("row").filter({ hasText: shown });
    await noName.getByRole("combobox", { name: "Account" }).selectOption({ label: seed.keepName });
    await noName.getByRole("button", { name: "Save" }).click();
    await expect(noName).toHaveCount(0);

    // 3. The suggested duplicate (same phone): merge it into the busier account.
    const pair = page
      .getByRole("row")
      .filter({ hasText: seed.mergeName })
      .filter({ hasText: seed.keepName });
    await expect(pair.getByRole("cell", { name: "same phone" })).toBeVisible();
    page.once("dialog", (dialog) => void dialog.accept());
    await pair.getByRole("button", { name: "Merge" }).click();
    await expect(pair).toHaveCount(0);

    // 20 + the fixed one + the named one + 17 moved; the merged account keeps its row.
    await expect
      .poll(
        () =>
          convexRunDev<PartyBills[]>("e2eSupport:partyBills", {
            ids: [seed.keepId, seed.mergeId],
          }),
        { timeout: 30_000 },
      )
      .toEqual([
        { id: seed.keepId, bills: 39, billCount: 39, mergedIntoId: null },
        { id: seed.mergeId, bills: 0, billCount: 0, mergedIntoId: seed.keepId },
      ]);

    await page.goto("/admin/accounts");
    await page.getByRole("checkbox", { name: "Merged" }).check();
    await page.getByRole("textbox", { name: "Search accounts" }).fill(seed.mergeName);
    await expect(page.getByRole("cell", { name: `merged into ${seed.keepName}` })).toBeVisible();
  });
});
