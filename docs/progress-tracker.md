# Mero Pasal — Progress Tracker

> This is the living status file. AI agents update it at the end of every session (see `ai-workflow-rules.md` §2).
> Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked (say why)

## Current status

| | |
|---|---|
| **Phase** | **M0 Foundations**: code merged (PRs #1–#8) and running locally against Convex dev; production deploy and Redmi test remain |
| **Current focus** | M3 browse and fix: code done (Part A merged; Part B stack ready for review); phone check on the iPhone 17 pending; M2 airplane-mode test on the iPhone pending |
| **Release target** | v1.0 Bill Book |
| **Blockers** | None |
| **Risks** | NFR-03: Today ships 262 KB gzipped JS (budget 250); React/Next ≈ 140 KB, Clerk + Convex ≈ 65 KB are the bulk. Judged on the Redmi instead: Today interactive < 2 s warm (ADR-031); time it in the phone test. |
| **Last updated** | 2083-06-07 BS (2026-09-23) |

**Capacity assumption:** ~4–5 h a day (~25–30 h a week). The estimates below are rough; re-plan after M1 with real velocity.

---

## v1.0 Bill Book

### M0 — Foundations (≈ 4–5 days)

**Exit:** Buwa's phone shows an installed, signed-in, empty Today screen.

- [x] Monorepo built by hand with the template's wiring ported (ADR-001 amended): `config`, `shared`, `backend`, `ui`, `apps/web`.
- [x] Root tooling: pnpm workspace, turbo tasks (`dev`, `build`, `lint`, `typecheck`, `test`, `e2e`), Biome, tsconfig bases. Pin TS version (architecture §2).
- [x] Clerk dev instance (`direct-drum-2930`): Google only, Convex integration, `CLERK_JWT_ISSUER_DOMAIN` on Convex dev `fine-marlin-976`, `auth.config.ts`, `ConvexProviderWithClerk`, `proxy.ts`; `CLERK_SECRET_KEY` set locally. Allowlist not enabled (the `members` check blocks strangers).
- [x] `convex/schema.ts` v1 (architecture §5.2, + `members.email`); `lib/functions.ts` wrappers; `lib/errors.ts`; `seed:bootstrap`. Second-pass auth review done; findings fixed.
- [x] `members.me` + "Not invited" screen.
- [x] Dev deployment seeded (`seed:bootstrap`): shop **Kavre Store / काभ्रे स्टोर**; `gayatri` = owner (ne), `binayak` = admin (en); walk-in नगद ग्राहक.
- [x] `shared/money` with tests (paisa, lakh formatting; रु / Rs, ADR-026).
- [x] `shared/dates` with tests: NPT today, BS↔AD, formatBs ne/en, monthOf, fiscalYearOf, and the range alarm test.
- [x] `shared/i18n`: typed `ne`/`en` dictionaries and `t()`, seeded from the ui-ux §8 copy deck.
- [x] `packages/ui`: `theme.css` tokens, fonts (Baloo 2, Mukta), `BigButton`, `Chip`, `Sheet`, `NumPad`, `AmountText`, `BsDateText`, `LedgerStrip`, `Stamp`.
- [x] PWA: manifest (name "मेरो पसल", placeholder icons until OD-4, standalone, portrait), Serwist (`@serwist/turbopack`) service worker with app-shell precache and `/~offline` fallback.
- [~] Deploy pipeline: **M1 test deploy live on Vercel** (`*.vercel.app`, root `apps/web`, corepack for pnpm 12, Convex dev + Clerk dev, no `CONVEX_DEPLOY_KEY`). Production (Convex prod, Clerk production instance, domain) is before M5.
- [ ] Redmi smoke test: install from Chrome, sign in, reopen from the icon, confirm no login prompt.

### M1 — Capture core (≈ 1 week) · F-02, F-03, F-04, F-05, F-10

**Exit:** a named bill with amount is captured online in ≤ 15 s on the Redmi.

**Status:** code complete; waiting on the local click-through, the test deploy, the voice spike and the Redmi stopwatch.
**Known M1 gaps, closed in M2:**
- The stamp shows after the server confirms, not after the phone stores the bill (NFR-02).
- Offline Save shows a message and keeps the bill on screen.

- [x] Photo pipeline (browser APIs, no library, no worker; ADR-010 amended): orientation, ≤1600 px, JPEG 0.72/0.6, 320 px thumbnail, EXIF/GPS stripped; Playwright fixtures (sideways+GPS, 50 MP, HEIF).
- [x] Capture state machine (`preview → party → amount → saving → saved`), add page (≤ 5), retake, leave-without-saving sheet + Android back guard.
- [x] `shared/names`: `transliterate`, `phoneticKey`, `searchParties`/`findSimilar` + 57-name fixture.
- [x] `parties.listForPicker`, `parties.create` (idempotent), `parties.similar`.
- [x] Name picker UI: walk-in row, recent with last bill, search, not-found card, new-name sheet, duplicate prompt, "Later".
- [x] Amount pad with lakh display, ≥ 5 lakh confirm, "Add amount later".
- [x] Date chip and sheet: today, yesterday, day before, BS month grid (≤ 90 days back, no future).
- [x] `shared/ledger.contribution()` + `convex/lib/ledger.apply()` + `dailySummaries` and `partyMonthly` upserts (second-pass reviewed).
- [x] `transactions.createFromClient` (idempotent) + ledger **invariant test**.
- [x] Today: header, two big buttons, ledger strip, recent 5; the stamp moment. Save goes online through `enqueue()` (M2 makes it offline-first).
- [x] Language switch persisted to `members.locale`.
- [~] **Voice spike (1 h):** Buwa says 20 real customer names into a bare test page (Web Speech API, `ne-NP`) on the Redmi. Record the hit rate and decide OD-5 (F-24 in v1.0 or v1.1).
  - Dry run 2083-06-07 (Binayak, laptop Chrome, quiet room): 14/18 transcripts usable (78%), 2.3–3.7 s each. Through `searchParties` the right account came first in every name tried, including run-together (रामप्रसाद) and misheard (घातीय → गायत्री) names. Brave can't use Web Speech (error `network`), so use Chrome. Several attempts were relations or nicknames (भाइको छोरो, घरपेटी बा, school, काले), a proposal to make tags searchable was **declined**: distinguishing words go in the name instead ("Ram gharbeti", ADR-029). Real spike: Buwa on the Redmi after the test deploy; score "right person first", not exact text.

### M2 — Offline and sync (≈ 1 week) · F-09

**Exit:** the F-09 acceptance tests pass on the Redmi and in Playwright.

- [x] Dexie DB `mero-pasal` (strict durability): `outbox`, `drafts`, `draftPages`, `cache`, `meta`; `navigator.storage.persist()`. Save = one transaction, then the stamp (NFR-02).
- [x] Sync engine: FIFO, names before bills, upload progress persisted, error classes + backoff, Web Locks, owner guard, purge, Try now (18 tests, 6 deliberate bugs caught).
- [x] `useCachedQuery`; Today (pending bills counted once, clock mark, "(पुरानो)") and the picker (incl. names added offline) work from cache.
- [x] Draft restore after tab kill: Today card **अधुरो बिल छ** → continue / remove (Binayak's choice: ask, not auto-resume).
- [x] Sync pill (ok / pending / offline / failed) + details sheet with "Try now" and a low-storage warning.
- [x] Offline shell not gated on Clerk (architecture §8.4): public shells + member snapshot (ADR-032); `/` and `/capture` precached per build; updates wait for idle; Clerk network-only; no reload on reconnect.
- [x] `members.heartbeat` → `memberSync` (own table; last seen, last full sync, pending/failed/other-account counts).
- [x] Playwright: offline capture ×5 → app closed → reopened offline → reconnect → exactly 5 on the server with photos (`offline-sync.spec.ts`, Clerk dev test user in its own E2E shop). It caught three bugs, all fixed: Save failed offline once Clerk dropped its userId; the screen crashed on reconnect after an offline start (unauthenticated queries); an auth pause delayed sending up to 2 min.
- [ ] Manual: airplane mode + app kill + cold start on the Redmi.

### M3 — Browse and fix (≈ 4–5 days) · F-06, F-07, F-08, F-15

**Exit:** UC-07 and UC-08 pass.

- [x] Bills list: BS date groups, filters (all / sold / bought / no amount), search, infinite scroll, thumbnails only (PRs #26–#33).
- [x] Accounts list (customers / suppliers tabs, this month from `partyMonthly`) and the account page (#34–#35).
- [x] Bill detail: zoom and pinch, page dots, ledger-line fields (#36–#37).
- [x] Correct (account, amount, date, type) and remove (confirm + 6 s undo) through the outbox; permission matrix (ADR-033).
- [x] Audit entries for every change; `audit.listForEntity` (admin; shown in the M4 drawer).
- [x] Playwright UC-07 and UC-08 (incl. a correction made without internet).
- [x] Second-pass review of Part B: 6 findings + 1 follow-up, each fixed in its own PR with a failing test; e2e also found and fixed "wake when due" and "reconnect ends backoff".
- [ ] Manual on the phone (Binayak's **iPhone 17**; no Redmi available): find any bill in ≤ 3 taps; correct an account; remove + undo; both in airplane mode with the bill open.
- Decided: browsing screens are online-only in M3 (offline shows the offline page); capture stays fully offline.

### M4 — Admin console (≈ 4–5 days) · F-11 to F-14

**Exit:** UC-09 and UC-10 pass.

- [ ] `/admin` layout, role gate, keyboard navigation.
- [ ] Overview: month totals, **Needs attention** queue with inline fixes, member sync health.
- [ ] Bills table with filters + drawer (photo, edit, bill number, note, restore, audit).
- [ ] Accounts: edit, archive, **merge** (batched move) + phonetic-key merge suggestions.
- [ ] Members: invite, role, deactivate.
- [ ] CSV export by BS date range.
- [ ] `summaries.rebuild` CLI repair tool.

### M5 — Field trial with Buwa (2 weeks)

**Exit:** v1.0 accepted and v1.1 scope confirmed.

- [ ] Phone setup checklist:
  - [ ] Chrome is the default browser
  - [ ] Chrome battery set to "No restrictions"
  - [ ] App installed and signed in
  - [ ] Persistent storage granted
  - [ ] Mobile data on as a fallback
- [ ] 15-minute training at the counter, plus a one-page Nepali instruction card (photo → name → amount → save).
- [ ] Daily for 14 days: compare paper bills written with bills captured; stopwatch 3 captures; log feedback below.
- [ ] Resolve spec §8 open questions 1–3 → `decisions.md`.
- [ ] Retrospective: what to cut, what to add, what's confusing.

### Recurring

- [ ] **Monthly backup** (1st of each BS month): CSV export + Convex snapshot, stored off-platform (F-14).
- [ ] **Monthly:** check the Convex usage dashboard (storage growth) and update dependencies outside feature work.

---

## Later releases (outline — expand when started)

| Release | Rough size | Milestones |
|---|---|---|
| v1.1 Hisab | 2–3 weeks | Voice spike on the Redmi (`ne-NP`); payment chips (F-20); money received and paid (F-21); balances and opening-balance bulk entry (F-22); day close (F-23); voice search (F-24); register switch-over with Buwa (UC-15) |
| v1.2 Reports | 2–3 weeks | Ledger view (F-30); month and FY reports (F-31); statement share (F-32); Excel and print exports (F-33) |
| v2 Smart | 1-week spike + 2–3 weeks | Label 60+ photos; eval harness; model choice (ADR); extraction action; suggestions and review queue (F-40 to F-43) |

---

## Trial metrics (M5)

| Date (BS) | Paper bills | Captured | Missing amount | Missing name | Median capture time | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |

## Buwa feedback log

| Date (BS) | What he said or did | Severity | Action / F-xx |
|---|---|---|---|
| | | | |

## Session log

| Date | Agent / person | Spec IDs | What changed | Follow-ups |
|---|---|---|---|---|
| 2083-06-07 | Claude (planning) | all | Initial documentation set, mockups, architecture | Start M0 |
| 2083-06-07 | Claude (planning) | F-04, F-24 | Voice now finds *or creates* names (confirm sheet); typed search gets an "Add “X”" card; paper look made explicit (ADR-022/023); mockup updated | Run voice spike in M1 |
| 2083-06-07 | Claude (M0) | F-01, F-02, F-03, F-05, F-10, F-13 | Steps 1–9: root tooling; shared money, domain, dates (UTC-only arithmetic, 33,238-day oracle test), i18n (copy-deck sync test); Convex schema, auth wrappers, `members.me`, seed; ui tokens + primitives; web shell (sign-in, Not invited, Today); Serwist PWA; Playwright smoke + vercel.json. Graphite + private GitHub repo (ADR-024…028). PRs #1–#8 merged | NFR-03 at 256 KB (budget 250): decide in M1 |
| 2083-06-07 | Binayak + Claude | F-01 | Local setup: Convex dev `fine-marlin-976`, Clerk dev `direct-drum-2930` (issuer set on Convex), `CLERK_SECRET_KEY` in `apps/web/.env.local`, dev data seeded. On `main`: lint, typecheck, 82 unit tests, 5/5 e2e green | Prod deploy + Redmi test; review `i18n-review` strings and month names |
