import type { AuthConfig } from "convex/server";

// Ported from the Convex monorepo template (ADR-001). Set per deployment with
// `convex env set CLERK_JWT_ISSUER_DOMAIN <Clerk Frontend API URL>` (architecture §10).
const clerkJwtIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!clerkJwtIssuerDomain) {
  throw new Error("Missing CLERK_JWT_ISSUER_DOMAIN in Convex environment variables");
}

export default {
  providers: [
    {
      domain: clerkJwtIssuerDomain,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
