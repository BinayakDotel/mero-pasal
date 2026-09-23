import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next 16 name for middleware (architecture §10). This only gates routes; authorization is
// enforced in Convex (ADR-003). Everything needs a session except sign-in, the offline page and
// the service worker (the SW precaches /~offline while installing, without cookies).
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/~offline", "/serwist/(.*)"]);

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
