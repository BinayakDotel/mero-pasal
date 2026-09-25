import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { convexRunDev, E2E_USER, signInE2e } from "./support/e2e-user";

// F-11 admin console against the dev E2E shop (the test user is its admin).
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

test.use({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false });

test.describe("F-11 admin console", () => {
  // These share the E2E shop's newest bill (edit, remove, restore): one worker, in order.
  test.describe.configure({ mode: "default" });
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
    await expect(page.getByRole("combobox", { name: "Month" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Sold", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "E2E", exact: true })).toBeVisible();
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
    await signInE2e(page);
    await page.goto("/admin/bills");
    await page.locator("tbody tr[aria-selected]").first().click({ timeout: 15_000 });
    const drawer = page.getByRole("complementary", { name: "Bill" });
    await expect(drawer.getByText(/^Captured by/)).toBeVisible();

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

  test("accounts: search, edit a tag, archive and bring back", async ({ page }) => {
    await signInE2e(page);
    await page.goto("/admin/accounts");
    await page.getByRole("textbox", { name: "Search accounts" }).fill("E2E Sita");
    const row = page.locator("tbody tr[tabindex]").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    const name = (await row.locator("td").first().textContent()) ?? "";
    await row.click();

    const dialog = page.getByRole("dialog", { name: `Account ${name}` });
    const tag = `t${Date.now() % 100_000}`;
    await dialog.getByRole("textbox", { name: "Tag" }).fill(tag);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("textbox", { name: "Search accounts" }).fill(tag); // finds by tag
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

    await page.getByRole("cell", { name, exact: true }).click();
    await dialog.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("cell", { name, exact: true })).toHaveCount(0); // hidden
    await page.getByRole("checkbox", { name: "Archived" }).check();
    await page.getByRole("cell", { name, exact: true }).click();
    await dialog.getByRole("button", { name: "Bring back" }).click();
    await page.getByRole("checkbox", { name: "Archived" }).uncheck();
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  });

  test("UC-10: exports a month as CSV, removed bills included", async ({ page }) => {
    await signInE2e(page);
    // One removed bill in this month, so the export must list it as "removed".
    await page.goto("/admin/bills");
    await page.locator("tbody tr[aria-selected]").first().click({ timeout: 15_000 });
    const drawer = page.getByRole("complementary", { name: "Bill" });
    page.once("dialog", (dialog) => void dialog.accept());
    await drawer.getByRole("button", { name: "Remove" }).click();
    await expect(drawer.getByRole("heading", { name: /removed/ })).toBeVisible();

    await page.goto("/admin/export");
    const month = page.getByRole("combobox", { name: "Month" });
    await month.selectOption({ index: 1 }); // this month
    const from = await page.getByRole("textbox", { name: "From (BS)" }).inputValue();
    const to = await page.getByRole("textbox", { name: "To (BS)" }).inputValue();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`mero-pasal-bills-${from}_${to}.csv`);
    const text = (await readFile((await download.path()) ?? "")).toString("utf-8");
    expect(text.startsWith("\uFEFFdate_bs,date_ad,type,account,amount_rs,")).toBe(true);
    const lines = text.trimEnd().split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.some((line) => line.endsWith(",removed"))).toBe(true);
    await expect(page.getByRole("status")).toContainText(`Exported ${lines.length - 1} bills.`);

    // Put the bill back for the other tests.
    await page.goto("/admin/bills");
    await page.getByRole("button", { name: "Removed", exact: true }).click();
    await page.locator("tbody tr[aria-selected]").first().click();
    await drawer.getByRole("button", { name: "Restore" }).click();
    await expect(drawer.getByRole("button", { name: "Remove" })).toBeVisible();
  });
});
