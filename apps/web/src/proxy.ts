import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next 16 name for middleware (architecture §10). This only gates routes; authorization is
// enforced in Convex (ADR-003, §10.4). Public without a fresh session:
// - sign-in, the offline page and the service worker (precached without cookies);
// - Buwa's app shells `/` and `/capture` (ADR-032): they hold no data (everything comes from
//   Convex, which checks the member on every call), and they must open offline, when the Clerk
//   token can't refresh. A signed-out visitor is sent to /sign-in by the shell itself.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/~offline",
  "/serwist/(.*)",
  "/",
  "/capture",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;
  await auth.protect();
});

export const config = {
  matcher: [
    // Ported from the template: skip Next internals and static files (incl. manifest and sw.js).
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
