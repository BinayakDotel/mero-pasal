import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { clerk } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * The Clerk DEV test user (plan M2 PR 1). `+clerk_test` addresses never get real email; the
 * testing helpers sign in with a one-time ticket from the dev secret key. Production is untouched.
 */
export const E2E_USER = {
  clerkUserId: process.env.E2E_CLERK_USER_ID ?? "user_3JjfPn6U7XPyczwDw2huFJBGZQt",
  email: process.env.E2E_CLERK_EMAIL ?? "binayakdotel01+clerk_test@gmail.com",
};

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

/**
 * `convex run` against the DEV deployment only (AGENTS.md rule 9): refuses unless
 * packages/backend/.env.local points at a `dev:` deployment, and drops any deploy key or
 * deployment from the environment so nothing else can redirect it. Returns the JSON result.
 */
export function convexRunDev<T>(fn: string, args: Record<string, unknown>): T {
  const backendEnv = readFileSync(path.join(repoRoot, "packages/backend/.env.local"), "utf-8");
  if (!/^CONVEX_DEPLOYMENT=dev:/m.test(backendEnv) || /^CONVEX_DEPLOY_KEY=/m.test(backendEnv)) {
    throw new Error("e2e: packages/backend/.env.local must point at the Convex dev deployment");
  }
  const { CONVEX_DEPLOY_KEY: _key, CONVEX_DEPLOYMENT: _deployment, ...env } = process.env;
  const out = execFileSync(
    "pnpm",
    ["--filter", "@mero-pasal/backend", "exec", "convex", "run", fn, JSON.stringify(args)],
    { cwd: repoRoot, env, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(out) as T;
}

/** Sign in as the E2E test user and land on Today. */
export async function signInE2e(page: Page): Promise<void> {
  await signInAs(page, E2E_USER.email);
}

/** Sign in as any existing Clerk test user and open the app. */
export async function signInAs(page: Page, emailAddress: string): Promise<void> {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress });
  await page.goto("/");
}

/**
 * M4 invite e2e: make sure a second Clerk test user exists on the DEV instance (a `+clerk_test`
 * address, created through the Clerk Backend API; its email counts as verified). Refuses any key
 * but a dev (`sk_test_`) one.
 */
export async function ensureClerkTestUser(email: string): Promise<void> {
  const key = process.env.CLERK_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_")) throw new Error("e2e: needs the Clerk DEV secret key");
  if (!email.includes("+clerk_test@")) throw new Error("e2e: only +clerk_test addresses");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const found = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers },
  );
  if (!found.ok) throw new Error(`e2e: Clerk user lookup failed (${found.status})`);
  if (((await found.json()) as unknown[]).length > 0) return;
  const made = await fetch("https://api.clerk.com/v1/users", {
    method: "POST",
    headers,
    body: JSON.stringify({ email_address: [email] }),
  });
  if (!made.ok) throw new Error(`e2e: Clerk user create failed (${made.status})`);
}
