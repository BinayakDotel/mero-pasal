import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { convexRunDev, E2E_USER, signInE2e } from "./support/e2e-user";

// F-11 admin console against the dev E2E shop (the test user is its admin). Tests that change
// data work on an account and bill of their own (seedAdminFixture), never on bills the phone-app
// tests are using at the same time.
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

type Fixture = { partyId: string; partyName: string; clientId: string };

const token = () =>
  Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join(
    "",
  );
const fixture = () => convexRunDev<Fixture>("e2eSupport:seedAdminFixture", { token: token() });

/** Open this test's own bill: the bills table filtered to its account has exactly that row. */
async function openOwnBill(page: Page, own: Fixture) {
  await page.goto("/admin/bills");
  await page.getByRole("combobox", { name: "Account" }).selectOption({ label: own.partyName });
  const rows = page.locator("tbody tr[aria-selected]");
  await expect(rows).toHaveCount(1, { timeout: 15_000 });
  await rows.first().click();
  const drawer = page.getByRole("complementary", { name: "Bill" });
  await expect(drawer.getByText(/^Captured by/)).toBeVisible();
  return drawer;
}

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
    const month = page.getByRole("combobox", { name: "Month" });
    await expect(month).toBeVisible();
    const monthName = (await month.locator("option:checked").textContent()) ?? "";
    const totals = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: monthName, level: 2 }) });
    await expect(totals.getByRole("cell", { name: "Sold", exact: true })).toBeVisible();
    const members = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /^Members/ }) });
    await expect(members.getByRole("cell", { name: "E2E", exact: true })).toBeVisible();
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

  test("the bill drawer edits a note, removes and restores, with history", async ({ page }) => {
    const own = fixture();
    await signInE2e(page);
    const drawer = await openOwnBill(page, own);

    const note = `e2e note ${Date.now()}`;
    await drawer.getByRole("textbox", { name: "Note" }).fill(note);
    await drawer.getByRole("button", { name: "Save" }).click();
    await expect(drawer.getByText("note changed").first()).toBeVisible();
    await expect(drawer.getByRole("textbox", { name: "Note" })).toHaveValue(note); // own save kept
    await expect(drawer.getByText("changed since you opened it")).toHaveCount(0);

    page.once("dialog", (dialog) => void dialog.accept());
    await drawer.getByRole("button", { name: "Remove" }).click();
    await expect(drawer.getByRole("heading", { name: /removed/ })).toBeVisible();
    await drawer.getByRole("button", { name: "Restore" }).click();
    await expect(drawer.getByRole("button", { name: "Remove" })).toBeVisible();
    await expect(drawer.getByText("restored").first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  });

  test("accounts: search, open the profile, edit a tag, archive and bring back", async ({
    page,
  }) => {
    const own = fixture();
    const { partyName: name } = own;
    await signInE2e(page);
    await page.goto("/admin/accounts");
    const search = page.getByRole("textbox", { name: "Search accounts" });
    await expect(search).toBeVisible();
    await page.keyboard.press("/"); // ui-ux §6: jumps to search
    await expect(search).toBeFocused();
    await search.fill(name);
    await page.getByRole("link", { name, exact: true }).click({ timeout: 15_000 });

    // The profile: details, totals, its own bill (Rs 123), its history.
    await expect(page).toHaveURL(new RegExp(`/admin/accounts/${own.partyId}$`));
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
    await expect(page.locator("tbody tr[aria-selected]")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByRole("cell", { name: "Rs 123" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Edit, archive or merge" }).click();
    const dialog = page.getByRole("dialog", { name: `Account ${name}` });
    const tag = `tag ${token()}`;
    await dialog.getByRole("textbox", { name: "Tag" }).fill(tag);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("heading", { name: `${name} · ${tag}`, level: 1 })).toBeVisible();
    await expect(page.getByText("party.update")).toBeVisible(); // history

    await page.getByRole("button", { name: "Edit, archive or merge" }).click();
    await dialog.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Archived (hidden from the name picker)")).toBeVisible();
    await page.goto("/admin/accounts");
    await page.getByRole("textbox", { name: "Search accounts" }).fill(tag); // finds by tag
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0); // archived: hidden
    await page.getByRole("checkbox", { name: "Archived" }).check();
    await page.getByRole("link", { name, exact: true }).click();
    await page.getByRole("button", { name: "Edit, archive or merge" }).click();
    await dialog.getByRole("button", { name: "Bring back" }).click();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
  });

  test("an unknown account id says not found", async ({ page }) => {
    await signInE2e(page);
    await page.goto("/admin/accounts/not-an-account");
    await expect(page.getByRole("heading", { name: "Account not found" })).toBeVisible();
  });

  test("UC-10: exports a month as CSV, removed bills included", async ({ page }) => {
    const own = fixture();
    await signInE2e(page);
    // This test's bill, removed: the export must still list it, as "removed".
    const drawer = await openOwnBill(page, own);
    page.once("dialog", (dialog) => void dialog.accept());
    await drawer.getByRole("button", { name: "Remove" }).click();
    await expect(drawer.getByRole("heading", { name: /removed/ })).toBeVisible();

    await page.goto("/admin/export");
    await page.getByRole("combobox", { name: "Month" }).selectOption({ index: 1 }); // this month
    const from = await page.getByRole("textbox", { name: "From (BS)" }).inputValue();
    const to = await page.getByRole("textbox", { name: "To (BS)" }).inputValue();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`mero-pasal-bills-${from}_${to}.csv`);
    const text = (await readFile((await download.path()) ?? "")).toString("utf-8");
    expect(text.startsWith("﻿date_bs,date_ad,type,account,amount_rs,")).toBe(true);
    const lines = text.trimEnd().split("\r\n");
    const mine = lines.filter((line) => line.includes(`,${own.partyName},`));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatch(/,sold,.*,123\.00,,1,E2E,removed$/);
    await expect(page.getByRole("status")).toContainText(/Exported \d+ bills\./);
  });
});
