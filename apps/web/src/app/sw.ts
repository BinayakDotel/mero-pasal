/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { disableNavigationPreload, NetworkOnly, Serwist } from "serwist";

// App shell (architecture §8.4, ADR-032): the built assets plus `/` and `/capture` are precached,
// so the installed app opens with no internet; pages never visited fall back to /~offline.
// Offline data lives in IndexedDB (features/sync), not here.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** Clerk's API (dev `*.clerk.accounts.dev`, production `clerk.<domain>`, `*.clerk.com`). */
function isClerk(url: URL): boolean {
  const host = url.hostname;
  return (
    host.endsWith(".clerk.accounts.dev") || host.endsWith(".clerk.com") || host.startsWith("clerk.")
  );
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  // A new version waits until the app says it's idle (no bill being made), then takes over via a
  // SKIP_WAITING message (features/sync/app-updater.tsx). Taking over mid-bill could delete code
  // the open page still needs. The very first install still controls the page at once.
  skipWaiting: false,
  clientsClaim: true,
  // Off: Serwist answers precached pages with the preload (network) response first, which would
  // make the shells network-first and hang a cold start on dead Wi-Fi.
  navigationPreload: false,
  // Sign-in traffic is never cached (§10): no session tokens in Cache Storage, and offline Clerk
  // sees a failure, not a stale "signed in" answer. The member snapshot covers offline (§8.4).
  runtimeCaching: [
    { matcher: ({ url, sameOrigin }) => !sameOrigin && isClerk(url), handler: new NetworkOnly() },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
// The preload setting lives on the registration and outlives workers: turn off what an earlier
// version enabled, or phones that already have the app would stay network-first.
disableNavigationPreload();
