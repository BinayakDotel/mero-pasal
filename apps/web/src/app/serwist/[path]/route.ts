import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";

// Serves /serwist/sw.js (with `Service-Worker-Allowed: /`). Precaches Buwa's app shells (public,
// ADR-032) so the installed app opens with no internet (architecture §8.4). Their revision is a
// hash of the commit and every precached file, so any build whose code differs (even a redeploy
// of the same commit with new env values) refetches the shells. Vercel builds have no .git.
const SHELLS = ["/", "/capture", "/~offline"];
const commit =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  "";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    manifestTransforms: [
      async (entries) => {
        if (process.env.NODE_ENV === "development") return { manifest: entries };
        const hash = createHash("sha256").update(commit);
        for (const entry of [...entries].sort((a, b) => a.url.localeCompare(b.url)))
          hash.update(`${entry.url} ${entry.revision ?? ""}\n`);
        const revision = hash.digest("hex").slice(0, 32);
        return { manifest: [...entries, ...SHELLS.map((url) => ({ url, revision, size: 0 }))] };
      },
    ],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  },
);
