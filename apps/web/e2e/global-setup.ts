import { clerkSetup } from "@clerk/testing/playwright";

// Fetches a Clerk testing token (dev instance only; clerkSetup refuses a production key) so the
// signed-in tests get past Clerk's bot protection. Without the secret those tests skip.
export default async function globalSetup() {
  if (process.env.CLERK_SECRET_KEY) await clerkSetup();
}
