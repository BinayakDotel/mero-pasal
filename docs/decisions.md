# Mero Pasal — Decisions Log

> These are short records of *why* the system looks the way it does. Add a new ADR rather than silently changing direction; mark superseded ones instead of deleting them.
> Format: **Decision** · **Why** · **Consequences / revisit when**. Status: `Accepted` unless noted.

### ADR-001 · Monorepo: Turborepo + pnpm workspaces
- **Decision:** One repo holding `apps/web`, `packages/{backend,shared,ui,config}`, `docs/`. Start from Convex's official Turborepo + Next.js + Clerk template, with Expo removed.
- **Why:** Binayak asked for a single repo. Shared TypeScript types flow from the Convex schema to the UI, and the template already solves the Convex-in-monorepo and Vercel build wiring.
- **Consequences:** Package boundaries are enforced (architecture §4). A native app would later be added as `apps/mobile`.
- **Amended 2026-09-23 (M0):** The template (da934ae) turned out to be mostly a demo notes app. We built the tree by hand and ported only its wiring: `vercel.json` build command, `proxy.ts`, `ConvexClientProvider`, `convex/auth.config.ts`, `convex/tsconfig.json`, and the `pnpm-workspace.yaml` settings. Same outcome, about 90 fewer files to delete.

### ADR-002 · Convex for database, functions, files and scheduling
- **Why:** Reactive queries update Today instantly, and one TypeScript codebase covers file storage, scheduled jobs (v2 AI) and transactions without running servers. Binayak has used it before.
- **Consequences:**
  - Design for per-function read limits (summaries, pagination).
  - Keep domain logic in `shared` to limit lock-in.
- **Revisit when:** storage costs grow, or offline needs outgrow the outbox approach.

### ADR-003 · Clerk with Google sign-in, invite-only; Convex `members` is the authority
- **Why:** Binayak knows Clerk. Google sign-in is one tap on an Android phone, with no password for Buwa to remember. The allowlist blocks strangers, and roles live in our own table. *(Allowlist superseded by ADR-034: membership in Convex alone blocks strangers; invites are member rows.)*
- **Consequences:** Authorization is always checked in Convex. `proxy.ts` gates routes only (Next 16 naming).

### ADR-004 · Installable PWA, not a native or Play Store app
- **Why:**
  - There's no Play Store account.
  - Updates are instant.
  - One codebase serves Buwa and the admin.
  - Camera, IndexedDB, service worker and speech all work in Chrome on Android.
- **Consequences:** Background work is limited on HyperOS; sync runs when the app is open.
- **Revisit when:** camera or offline limits bite. Options then are wrapping as a TWA (Bubblewrap → APK) or an Expo app in `apps/mobile`, which Convex and Clerk support.

### ADR-005 · No AI in v1
- **Why:** Binayak's call. Learn Buwa's real workflow first. The core value (filing and finding bills) needs no AI.
- **Consequences:** Keep optional fields (`billNumber`, `pan`) and the `needsAttention` flag so v2 can slot in. Reserve an `extractions` table for v2.

### ADR-006 · One `transactions` table for every money event
- **Decision:** Sales, purchases, payments in and out, opening balances and adjustments are all rows in `transactions`, distinguished by `kind`.
- **Why:** The collective ledger (v1.2) is a single index scan. Balances and reports share one contribution function.
- **Consequences:** The UI calls sales and purchases "bills"; other kinds are "entries".

### ADR-007 · Money as integer paisa; whole-rupee input in v1
- **Why:** No floating-point errors. The number pad stays simple (`00` key, no decimal point).
- **Revisit when:** Buwa needs paisa on bills.

### ADR-008 · BS date strings + NPT, via one shared wrapper
- **Decision:**
  - Store `dateBs` as `"YYYY-MM-DD"` (sortable and range-queryable) plus `dateAd`, the ms at NPT midnight.
  - The client computes "today".
  - All conversion goes through `@mero-pasal/shared/dates`, which wraps `nepali-date-converter`.
- **Consequences:** The library supports BS ≤ 2090. An alarm test warns 2 years ahead.

### ADR-009 · Native camera via file input
- **Why:** Buwa already knows his phone's camera. It gives the best image quality and focus with no custom camera code.
- **Revisit when:** v2 wants guided framing or edge detection.

### ADR-010 · Client-side compression + thumbnails; storage behind one module
- **Decision:** Full image ≤1600 px (~300 KB) and a 320 px thumbnail (~25 KB), both in Convex storage, accessed only through `convex/files.ts`.
- **Why:** This cuts upload time on shop Wi-Fi, keeps lists fast on a budget phone, and keeps storage cost low.
- **Revisit when:** yearly storage cost matters; move to R2 or S3 behind the same module.
- **Amended 2026-09-23 (M1):** No `browser-image-compression` dependency. Browser APIs (`createImageBitmap` with decode-time resize + EXIF orientation, `OffscreenCanvas` JPEG encode) do the job with less JS (NFR-03). The full-size target is ≤ ~450 KB (retry at quality 0.6). It runs from the page rather than a Web Worker, because Turbopack emits `new Worker(new URL(...))` targets as raw files.

### ADR-011 · Offline outbox in IndexedDB (Dexie) with idempotent mutations
- **Why:** Power cuts drop the Wi-Fi, and losing a bill destroys trust. Idempotency by `clientId` makes retries safe.
- **Consequences:** All of Buwa's writes go through `enqueue()`. Offline cold start is best effort, because Clerk can't load offline.

### ADR-012 · Party search runs on the client with a phonetic key across scripts
- **Why:** It's instant and works offline. A shop has hundreds, not millions, of accounts, and Nepali names vary across scripts and spellings (v/b, aspirates, "Bdr").
- **Consequences:** `listForPicker` returns all active parties (trimmed). Revisit above ~5,000 parties.

### ADR-013 · Precomputed `dailySummaries` and `partyMonthly`, updated atomically
- **Why:** Today, account lists and monthly and FY reports stay fast within Convex read limits.
- **Consequences:**
  - Every transaction write goes through `ledger.apply`.
  - A rebuild tool and an invariant test guarantee correctness.

### ADR-014 · `shopId` on every table, never from the client
- **Why:** It costs almost nothing now and keeps the productisation option open (Binayak estimates shops might pay around NPR 1.5k a month). It also prevents a whole class of access bugs.

### ADR-015 · Soft delete + audit log; no hard deletes
- **Why:** Tax records must be kept 6 years, and in family use "who changed this?" matters. Undo is trivial.

### ADR-016 · Biome, Vitest, convex-test, Playwright
- **Why:** One fast tool for lint and format across the monorepo, with test runners that match each layer.

### ADR-017 · PDFs via print-optimised HTML (v1.2) — *Proposed*
- **Why:** Browsers shape Devanagari conjuncts correctly; many JS PDF libraries don't.
- **Revisit:** validate during v1.2 with real Nepali names.

### ADR-018 · `AGENTS.md` is the single AI instruction source; `CLAUDE.md` imports it
- **Why:** Claude Code reads `CLAUDE.md`, not `AGENTS.md`. Cursor reads `AGENTS.md`. One import line keeps them in sync.

### ADR-019 · Vercel Hobby while the project is family and non-commercial
- **Why:** It's free. Vercel restricts Hobby to non-commercial use.
- **Revisit when:** any shop pays, or the project becomes a business → move to Pro.

### ADR-020 · Own typed i18n dictionaries, Nepali default
- **Why:** Two languages and a few hundred strings. A typed `Record` makes missing translations a compile error with no library weight.
- **Consequences:** No ICU plural rules; use `{n}` params and phrase sentences to avoid plurals.

### ADR-021 · Buwa's app and the admin console share one Next.js app
- **Why:** One deploy, one auth setup, shared components. The admin console lives under `/admin` behind the role gate, and heavy admin libraries are loaded dynamically.

### ADR-022 · Paper and ledger visual language is a product decision
- **Decision:**
  - Buwa's app keeps the ruled-ledger look (ui-ux §3.5): paper grain, ruled lines, the red register margin, a double rule under totals, and the rubber-stamp save.
- **Why:**
  - Binayak confirmed that the paper feel is what will make his father comfortable.
  - Familiarity lowers the learning cost more than any "modern" pattern would.
- **Consequences:**
  - Visual refactors must preserve these elements.
  - Proposals to change them need Binayak's explicit OK and a superseding ADR.

### ADR-023 · Voice can create names, but only after a confirmation tap
- **Decision:**
  - F-24 covers both *find* and *create*.
  - When nothing matches, one button adds exactly the heard name. A "नाम ठीक छ?" sheet always shows it before it's saved.
- **Why:**
  - This was part of Binayak's original vision.
  - Speech recognition of Nepali names will sometimes be wrong, and a wrong account is worse than one extra tap.
- **Revisit when:** the voice spike shows near-perfect recognition (never skip confirmation for new names, though).

### ADR-024 · Product renamed from "Hisab" to "Mero Pasal"
- **Decision:**
  - The product is **Mero Pasal** (मेरो पसल). The code scope is `@mero-pasal/*`, the repo root is `mero-pasal/`, and the PWA icon label is "मेरो पसल".
  - "Hisab" stays as the name of the **v1.1 release** (udharo and daily money), and हिसाब stays in Nepali copy where it's the ordinary word (दिनको हिसाब).
- **Why:** Binayak's call before scaffolding (2026-09-23), so no code has to be renamed later.

### ADR-025 · TypeScript pinned to 6.0.3
- **Decision:** Pin `typescript@6.0.3` (what the Convex template ships), not npm `latest` 7.0.x.
- **Why:** TS 7 is the new native compiler; Next's TS plugin, convex codegen and Biome haven't been proven on it in this repo. Architecture §2 says to follow the template.
- **Note:** TS 6 defaults `types` to `[]`, so each tsconfig lists the ambient types it needs (e.g. `node`).
- **Revisit when:** Next.js and Convex document TS 7 support; upgrade outside feature work.

### ADR-026 · Money display: `रु` in Nepali, `Rs` in English
- **Decision:** `formatNpr` prints `रु 1,23,456` (ne) and `Rs 1,23,456` (en), Latin digits and lakh grouping in both. Paisa appear only when non-zero; negatives put the minus first (`-रु 1,200`).
- **Why:** Matches the mockup; Binayak confirmed during M0 (F-10 previously said `रु` for both).

### ADR-027 · Graphite stacked PRs on a private GitHub repo
- **Decision:**
  - The repo is `github.com/BinayakDotel/mero-pasal` (private), trunk `main`. The two M0 commits (tooling and docs, money) are the baseline on `main`.
  - From M0 step 3 on, every change is a Graphite branch and PR, stacked when it depends on unmerged work.
  - The repo pins its git identity locally (Binayak Dotel, personal gmail, matching the GitHub account).
  - AI agents never commit, branch, push or submit until Binayak says so (ai-workflow-rules §5 rule 11).
- **Why:** Binayak wants every change reviewable in small pieces. The plan's gated steps (money, dates, schema, auth) map naturally to one PR each, and stacking lets work continue while earlier PRs wait for review.
- **Consequences:** `gt sync` after merges; PRs, not local commits, are the unit of review.

### ADR-028 · Serwist's Turbopack integration for the service worker
- **Decision:** Use `@serwist/turbopack` + `serwist` 9.5.12 (with `esbuild` to bundle the worker) instead of the webpack-based `@serwist/next` named in the original stack table.
- **Why:** Next 16 builds with Turbopack by default. The Turbopack integration serves the worker from a route handler (`/serwist/sw.js`) with `Service-Worker-Allowed: /`, so it controls the whole app without switching the build back to webpack.
- **Consequences:** The service worker lives at `src/app/sw.ts`. `/~offline` and `/serwist/*` are public in `proxy.ts` so the worker can precache them. The worker is disabled in `next dev`.
- **Alternative considered:** `@serwist/next` with `next build --webpack`: slower builds and a second bundler to maintain.

### ADR-029 · Tags are not searchable; distinguishing words go in the name
- **Decision:** Search (`searchParties`) matches names only. To tell people apart, Buwa saves the distinguishing word as part of the name ("Ram gharbeti", "Ram school"). The optional tag stays as a note shown after the name.
- **Why:** Binayak's call (2026-09-23), after the voice dry run showed people are known by relation or nickname. Every word of a name is already searchable in both scripts, so this needs no extra matching rules and adds no noise from common tag words.
- **Consequences:** The new-name sheet's hint should suggest this pattern (M1 PR 9). Revisit if Buwa keeps typing tags he then can't find.

### ADR-030 · The last bill is stored on the account
- **Decision:** Add optional `parties.lastBillDateBs` / `lastBillPaisa`, maintained by `ledger.apply`, instead of reading each account's latest bill inside `listForPicker`.
- **Why:** The picker line "हिजो · रु 2,340" (F-04) needs it for every visible name. Every save already patches the party row, so storing it costs nothing extra. It also keeps `listForPicker` a single index read and gives M2's offline cache the same data.
- **Consequences:** Backward-compatible (optional fields, no backfill: no bills existed). `ledger.apply` refreshes the fields for every account a write touches with one read on the index `by_shop_party_status_date` (latest active bill), however many recent bills were removed. The ledger invariant test covers it.

### ADR-031 · NFR-03 is judged on the Redmi, not only by bundle size
- **Decision:** 250 KB gzipped first-load JS stays the goal for Buwa's routes, but the pass/fail test is NFR-03's user-facing target: **Today interactive in under 2 s on a warm start on the Redmi 15C**, timed during M1's phone test.
- **Why:** At the end of M1, Today is 262 KB. About 205 KB of that is React/Next (~140 KB) plus the Clerk and Convex clients (~65 KB), which the app can't drop. The installed PWA loads its code from the service-worker cache, so warm starts pay for parsing, not downloading. Binayak agreed (2026-09-23).
- **Consequences:**
  - New heavy dependencies still need a line here.
  - Capture code stays on its own route.
  - If the Redmi misses 2 s, the first levers are lazy-loading Clerk's UI and trimming Today's imports.

### ADR-032 · Buwa's app shells are public routes; the member check lives in Convex
- **Decision:** `proxy.ts` no longer requires a session for `/` and `/capture`. They are client-only shells: all data comes from Convex, which checks the member on every call (§10.4). A visitor who isn't signed in is sent to `/sign-in` by the shell. On this device, the member last confirmed by the server keeps the app usable while the Clerk token can't refresh offline, unless Clerk says signed out or a different account is signed in (`gate-decision.ts`).
- **Why:** Found in M2 testing (2026-09-23). Offline, the Clerk session token (about 60 s) can't refresh, so the proxy redirected "open the bill screen" to sign-in, and Convex's "not authenticated" showed the sign-in-again screen. Both lock Buwa out during a power cut, exactly when capture matters most (principle 2, NFR-04). Clerk's middleware also answers cold starts with a redirect the service worker would cache.
- **Consequences:**
  - Other routes (`/not-invited`, `/spike/*`, and later `/admin`) stay protected.
  - Bills made offline sync only once the server accepts the session again (the engine pauses on auth errors).
  - A different Google account never sees the previous member's screens.

### ADR-033 · Corrections and removals go through the outbox as full values
- **Decision:** Buwa's corrections and removals are outbox items like bills (ADR-011). A correction sends the bill's full new values, not a diff; the server applies them through `ledger.apply` and does nothing if nothing changed. A removal is queued behind a 6 s undo window, and Undo deletes it on the phone, so the server never sees an undone removal; after that, only admin can restore (M4). A bill removed before it ever left the phone never goes to the server.
- **Why:** Full values make retries exactly-once without a new table of applied operations (no schema change), and last-write-wins is fine for one family shop. Undo-before-send keeps restore admin-only, as the mockup copy promises ("बिनायकले फर्काउन सक्छन्"). The M3 second-pass review found the ordering and staleness rules now in architecture §8.3.
- **Consequences:**
  - Two devices correcting the same bill: the last one sent wins.
  - Audit history is shown in the admin drawer (M4), not on Buwa's account page (F-15 note).
  - Browsing screens are online-only in M3; a bill already open can still be changed offline.

### ADR-034 · The admin console is English-only; invites are claimed by email; merges move bills
- **Decision:**
  - `/admin` is for Binayak and is English-only (ui-ux §6). Its text is plain English in the code: golden rule 6 ("no hard-coded UI strings", ne + en keys) covers Buwa's app, not `/admin`.
  - An invite is a member row with the person's email and no Clerk user yet. The first time they sign in with that Google account, `members.claimInvite` links it, but only on a verified email from the sign-in token (trimmed, lowercased). There is no Clerk allowlist; anyone else sees "not invited".
  - Merging accounts moves every bill through `ledger.apply` in batches (continuing in the background), then marks the merged account `mergedIntoId`. Nothing is deleted.
  - Admin writes are online-only: there's no outbox for `/admin`.
- **Why:** Binayak's choices at M4 planning (2026-09-25). i18n keys for a one-person English console are noise. Membership already blocks strangers in Convex (ADR-003), so an allowlist would only add a second list to keep in sync. Moving bills through `ledger.apply` keeps totals equal to a recount (ADR-013).
- **Consequences:**
  - A stranger can create a Clerk account but sees "not invited".
  - The Clerk session token must carry `email` and `email_verified` (Clerk Dashboard → Sessions → Customize session token).
  - Admin screens show an offline banner and don't save offline.

### ADR-035 · The v1 trial runs on the Clerk development instance and the Convex production deployment
- **Decision:**
  - For the M5 trial the app is served at the Vercel production URL (`*.vercel.app`) and signs in through the **Clerk development instance** (`direct-drum-2930`), because a Clerk production instance needs a domain we own and the domain isn't chosen yet (OD-4).
  - Buwa's real bills live in the **Convex production deployment**, never in the dev deployment (which holds test and e2e data). Production's `CLERK_JWT_ISSUER_DOMAIN` points at the Clerk dev instance.
  - Vercel Production builds deploy Convex production (`CONVEX_DEPLOY_KEY`); Preview builds never do (no deploy key; they use Convex dev).
  - Binayak runs every production step by hand from `docs/go-live.md` (golden rule 9).
- **Why:** Binayak's choice at M5 planning (2026-09-26): start the trial now, buy a domain later. Keeping real data in its own deployment means test runs can never touch it, and the switch to a real domain later changes only sign-in.
- **Consequences:**
  - Clerk's sign-in page shows its development badge; dev instances are capped (100 users), which is fine for a family shop.
  - The Clerk dev instance must keep the `email`/`email_verified` session claims (ADR-034) and a session lifetime ≥ 30 days (F-01).
  - **Switching to Clerk production later** gives every person a new Clerk user id. Because invites are claimed by verified email (ADR-034), the switch is a one-off, planned migration that clears `members.clerkUserId`, so each member is linked again on their next sign-in; bills and history don't move.
- **Revisit when:** the domain is chosen (OD-4), and before v1.0 is called done.

### ADR-036 · Editing an account on the phone is online-only
- **Decision:** The owner (and admin) edit an account's name, phone, tag and kind from its page on the phone by calling `partyAdmin.update` directly, not through the outbox. Offline, the edit button explains that the internet is needed.
- **Why:** Binayak's request during M5 setup (2026-09-27). Renaming is rare and never part of taking a bill, so golden rule 1 (capture never blocks) isn't touched. Queuing renames offline would add a new outbox item type and conflict rules (a rename racing a merge, or another rename) for little gain. The phone's name cache is a live query, so a rename reaches every screen as soon as it's saved.
- **Consequences:** The same audited, permission-checked mutation serves `/admin` and the phone. Staff see the details but no edit button.

### ADR-037 · Deleting an account removes its bills, and can be undone
- **Decision:**
  - The admin deletes an account from its profile in `/admin` (the owner can't, and the phone can't). Every active bill of the account is removed through `ledger.apply` as a soft delete with `deletedReason: "account"`, in batches; then the account gets `deletedAt` and leaves every list, picker and total. Nothing is hard-deleted (golden rule 5).
  - **Bring back** restores the account and exactly the bills its delete removed. Bills removed one by one earlier stay removed.
  - A bill landing on a deleted account, or one being deleted, brings the account back (`ledger.apply`, audit `party.revive`): e.g. a bill Buwa saved offline before the delete. A removal or correction sent late from the phone for a bill removed with its account is still applied; a correction that moves it to another account brings the bill back there.
  - From 10 bills on, the confirm dialog asks for the account's name (or its Latin form) to be typed.
- **Why:** Binayak's request during the M5 trial (2026-09-27), to clear test and mistaken accounts; his choices: delete with its bills, admin only, type the name from 10 bills. The phone's outbox counts `CONFLICT` as a failure (5 → failed), so refusing late phone writes would turn a cleanup into failed bills on Buwa's phone; bringing the account back keeps golden rule 1.
- **Consequences:**
  - An account can come back by itself when a late bill arrives. Its history says why, and its other bills stay removed until the admin brings them back ("Bring them back" on its profile).
  - Deleted accounts can't be edited, archived or merged; the walk-in and merged or merging accounts can't be deleted. A merge turns bills an earlier delete removed into ordinary removed bills.
  - `trial:day` doesn't count bills removed with an account as Buwa's removals.

---

## Open decisions

Resolve these during the M5 trial.

| # | Question | Options | Decide by |
|---|---|---|---|
| OD-1 | Should an amount be required? | Keep optional / require after trial | End of M5 |
| OD-2 | Day-close inputs | Total sales + QR / cash counted + QR | Start of v1.1 |
| OD-3 | Aama's account | Staff account / Buwa enters her bills | During M5 (not at go-live: Buwa alone first, 2026-09-26) |
| OD-4 | Shop name, logo, domain | — | Before v1.0 (the trial runs on `*.vercel.app` with Clerk dev: ADR-035) |
| OD-5 | Voice (F-24) in v1.0 or v1.1? | Pull into v1.0 if the M1 voice spike is ≥ 80% usable | During M1 |
