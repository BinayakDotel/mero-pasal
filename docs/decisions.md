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
- **Why:** Binayak knows Clerk. Google sign-in is one tap on an Android phone, with no password for Buwa to remember. The allowlist blocks strangers, and roles live in our own table.
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

---

## Open decisions

Resolve these during the M5 trial.

| # | Question | Options | Decide by |
|---|---|---|---|
| OD-1 | Should an amount be required? | Keep optional / require after trial | End of M5 |
| OD-2 | Day-close inputs | Total sales + QR / cash counted + QR | Start of v1.1 |
| OD-3 | Aama's account | Staff account / Buwa enters her bills | During M5 |
| OD-4 | Shop name, logo, domain | — | Before M5 |
| OD-5 | Voice (F-24) in v1.0 or v1.1? | Pull into v1.0 if the M1 voice spike is ≥ 80% usable | During M1 |
