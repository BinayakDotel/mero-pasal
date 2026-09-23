import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next 16 name for middleware (architecture §10). This only gates routes; authorization is
// enforced in Convex (ADR-003). Everything except sign-in and static files needs a session.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)"]);

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
