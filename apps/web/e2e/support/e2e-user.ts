import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

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
