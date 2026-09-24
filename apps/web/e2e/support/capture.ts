import path from "node:path";
import { expect, type Page } from "@playwright/test";

const photo = path.join(import.meta.dirname, "..", "fixtures", "rotated.jpg");

export function saleButton(page: Page) {
  return page.getByRole("button", { name: /^बेचेको बिल/ });
}

/**
 * F-03 happy path from Today: photo → use → account → amount → save → stamp → back on Today.
 * Without a name it's the walk-in; with one it searches the picker and picks that account, or
 * adds the name if it doesn't exist yet (names are unique enough per test).
 */
export async function takeBill(page: Page, rupees: string, name?: string) {
  const chooser = page.waitForEvent("filechooser");
  await saleButton(page).click();
  await (await chooser).setFiles(photo);
  await page.getByRole("button", { name: "ठीक छ" }).click();
  if (name === undefined) {
    await page.getByRole("button", { name: /नगद ग्राहक/ }).click();
  } else {
    await pickOrAddName(page, name);
  }
  for (const digit of rupees) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await page.getByRole("button", { name: "बिल राख्नुहोस्" }).click();
  await expect(page.getByText("राखियो")).toBeVisible();
  await expect(saleButton(page)).toBeVisible({ timeout: 10_000 });
}

/**
 * F-04 picker: the account with exactly this name, or add it — via "add this name" or, when a
 * similar name exists, "a different person? add new" and then "no, create new".
 */
export async function pickOrAddName(page: Page, name: string) {
  await page.getByRole("searchbox", { name: "नाम खोज्नुहोस् (नेपाली वा English)" }).fill(name);
  // A picker row reads "name" then its last bill ("आज · रु 40"), so match the name as a prefix.
  const exact = page.getByRole("button", { name: new RegExp(`^${escapeRegExp(name)}(\\s|$)`) });
  const add = page.getByRole("button", { name: new RegExp(`^“${escapeRegExp(name)}”`) });
  await expect(exact.or(add).first()).toBeVisible();
  if (await exact.isVisible()) {
    await exact.click();
    return;
  }
  await add.first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("textbox", { name: "नाम" })).toHaveValue(name);
  const createNew = sheet.getByRole("button", { name: "होइन, नयाँ बनाउनुहोस्" });
  if (await createNew.isVisible()) await createNew.click();
  await sheet.getByRole("button", { name: "नाम राख्नुहोस्" }).click();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
