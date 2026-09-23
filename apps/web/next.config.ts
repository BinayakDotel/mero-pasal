import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (code-standard §1: explicit `exports` subpaths).
  transpilePackages: ["@mero-pasal/shared", "@mero-pasal/ui", "@mero-pasal/backend"],
};

export default nextConfig;
