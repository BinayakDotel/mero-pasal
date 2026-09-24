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
    await page.getByRole("searchbox", { name: "नाम खोज्नुहोस् (नेपाली वा English)" }).fill(name);
    const addThis = page.getByRole("button", { name: `“${name}” नाम थप्नुहोस्` });
    const existing = page
      .getByRole("button")
      .filter({ hasText: name })
      .filter({ hasNotText: "थप्नुहोस्" });
    await expect(addThis.or(existing).first()).toBeVisible();
    if (await addThis.isVisible()) {
      await addThis.click();
      await page.getByRole("button", { name: "नाम राख्नुहोस्" }).click();
    } else {
      await existing.first().click();
    }
  }
  for (const digit of rupees) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await page.getByRole("button", { name: "बिल राख्नुहोस्" }).click();
  await expect(page.getByText("राखियो")).toBeVisible();
  await expect(saleButton(page)).toBeVisible({ timeout: 10_000 });
}
