import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (code-standard §1: explicit `exports` subpaths).
  transpilePackages: ["@mero-pasal/shared", "@mero-pasal/ui", "@mero-pasal/backend"],
};

// ADR-004 / architecture §2: Serwist's Turbopack integration builds the service worker.
export default withSerwist(nextConfig);
