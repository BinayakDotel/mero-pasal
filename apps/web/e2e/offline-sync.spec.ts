import path from "node:path";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { convexRunDev, E2E_USER, signInE2e } from "./support/e2e-user";

// F-09 acceptance (M2 exit, plan PR 9) against the production build and the Convex DEV
// deployment: bills made offline survive the app being closed and reach the server exactly once,
// with their photos. The test user has its own shop (e2eSupport.ensureE2eShop).
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);
const photo = path.join(import.meta.dirname, "fixtures", "rotated.jpg");
const OFFLINE_BILLS = 5;

test.describe("F-09 offline sync", () => {
  test.skip(!hasClerkSecret, "Set CLERK_SECRET_KEY in apps/web/.env.local to run these");

  test.beforeAll(() => {
    convexRunDev("e2eSupport:ensureE2eShop", E2E_USER);
  });

  test("5 bills offline → app closed → reopened offline → online: exactly 5 on the server", async ({
    context,
    page,
  }) => {
    test.setTimeout(240_000);

    await signInE2e(page);
    await expect(saleButton(page)).toBeVisible({ timeout: 30_000 });

    // The service worker must control the page before the connection goes (architecture §8.4).
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);

    // One bill online first: it fills the phone's name cache, as normal use does.
    await takeBill(page, "12");
    await expect.poll(() => pendingBillIds(page), { timeout: 30_000 }).toEqual([]);
    await expect(page.getByText("सबै सुरक्षित")).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByText("इन्टरनेट छैन — बिल फोनमा सुरक्षित छन्")).toBeVisible();
    for (let i = 1; i <= OFFLINE_BILLS; i++) await takeBill(page, String(10 + i));
    const clientIds = await pendingBillIds(page);
    expect(clientIds).toHaveLength(OFFLINE_BILLS);

    // "Swipe the app away": a fresh page, still offline, must open from the phone.
    const reopened = await context.newPage();
    await page.close();
    await setupClerkTestingToken({ page: reopened });
    await reopened.goto("/");
    await expect(saleButton(reopened)).toBeVisible({ timeout: 30_000 });
    await expect(reopened.getByText("इन्टरनेट छैन — बिल फोनमा सुरक्षित छन्")).toBeVisible();
    expect(await pendingBillIds(reopened)).toEqual(clientIds);

    await context.setOffline(false);
    await expect.poll(() => pendingBillIds(reopened), { timeout: 120_000 }).toEqual([]);
    await expect(reopened.getByText("सबै सुरक्षित")).toBeVisible();

    const onServer = convexRunDev<{ clientId: string; photos: number; status: string }[]>(
      "e2eSupport:billsByClientIds",
      { clientIds },
    );
    expect(onServer.map((b) => b.clientId).sort()).toEqual([...clientIds].sort());
    for (const bill of onServer) expect(bill).toMatchObject({ photos: 1, status: "active" });
  });
});

function saleButton(page: Page) {
  return page.getByRole("button", { name: /^बेचेको बिल/ });
}

/** F-03 happy path: photo → use → walk-in → amount → save → stamp → back on Today. */
async function takeBill(page: Page, rupees: string) {
  const chooser = page.waitForEvent("filechooser");
  await saleButton(page).click();
  await (await chooser).setFiles(photo);
  await page.getByRole("button", { name: "ठीक छ" }).click();
  await page.getByRole("button", { name: /नगद ग्राहक/ }).click();
  for (const digit of rupees) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await page.getByRole("button", { name: "बिल राख्नुहोस्" }).click();
  await expect(page.getByText("राखियो")).toBeVisible();
  await expect(saleButton(page)).toBeVisible({ timeout: 10_000 });
}

/** clientIds of bills still waiting in the phone's outbox (IndexedDB `mero-pasal`). */
function pendingBillIds(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("mero-pasal");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const read = open.result.transaction("outbox").objectStore("outbox").getAll();
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            open.result.close();
            const rows = read.result as { type: string; status: string; clientId: string }[];
            resolve(
              rows
                .filter((r) => r.type === "tx.create" && r.status !== "done")
                .map((r) => r.clientId)
                .sort(),
            );
          };
        };
      }),
  );
}
