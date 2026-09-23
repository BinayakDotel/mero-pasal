import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// Serves /serwist/sw.js (with `Service-Worker-Allowed: /`). The revision busts the precached
// offline page on each deploy; Vercel builds have no .git, so prefer its commit SHA.
const gitSha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim();
const revision = process.env.VERCEL_GIT_COMMIT_SHA || gitSha || crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  },
);
