import { expect, test } from "@playwright/test";

// M0 smoke tests (progress tracker step 9). Anything that passes through Clerk's proxy needs
// CLERK_SECRET_KEY in apps/web/.env.local; those tests skip with a clear reason without it.
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

test("F-01: the install manifest names the app मेरो पसल", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({
    name: "मेरो पसल",
    display: "standalone",
    orientation: "portrait",
    start_url: "/",
    lang: "ne",
  });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  }
});

test("ADR-004: the service worker is served for the whole app scope", async ({ request }) => {
  const res = await request.get("/serwist/sw.js");
  expect(res.ok()).toBe(true);
  expect(res.headers()["service-worker-allowed"]).toBe("/");
  const worker = await res.text();
  expect(worker).toContain("~offline");
  // Architecture §8.4 / ADR-032: the app shells are precached, so the app opens offline.
  expect(worker).toMatch(/url:\s*"\/capture"|"url":"\/capture"/);
  expect(worker).toMatch(/url:\s*"\/"|"url":"\/"/);
});

test.describe("with Clerk", () => {
  test.skip(!hasClerkSecret, "Set CLERK_SECRET_KEY in apps/web/.env.local to run these");

  test("F-01: signed-out visitors are sent to sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("heading", { name: "मेरो पसल" })).toBeVisible();
  });

  test("F-01: the sign-in page explains itself in both languages", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText("Google खाताबाट भित्र पस्नुहोस्")).toBeVisible();
    await expect(page.getByText("Sign in with your Google account")).toBeVisible();
  });

  test("the offline page is reachable without a session", async ({ page }) => {
    await page.goto("/~offline");
    await expect(page.getByRole("heading", { name: "इन्टरनेट छैन" })).toBeVisible();
  });
});
