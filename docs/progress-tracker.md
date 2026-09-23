# Mero Pasal — Progress Tracker

> This is the living status file. AI agents update it at the end of every session (see `ai-workflow-rules.md` §2).
> Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked (say why)

## Current status

| | |
|---|---|
| **Phase** | Planning complete → **M0 Foundations** next |
| **Current focus** | M0: scaffold the monorepo from the Convex Turborepo template, auth, schema v1, shared dates and money |
| **Release target** | v1.0 Bill Book |
| **Blockers** | None |
| **Last updated** | 2083-06-07 BS (2026-09-23) |

**Capacity assumption:** ~4–5 h a day (~25–30 h a week). The estimates below are rough; re-plan after M1 with real velocity.

---

## v1.0 Bill Book

### M0 — Foundations (≈ 4–5 days)

**Exit:** Buwa's phone shows an installed, signed-in, empty Today screen.

- [ ] Scaffold from `get-convex/turbo-expo-nextjs-clerk-convex-monorepo`. Remove Expo, rename packages to `@mero-pasal/*`, add `packages/shared`, `packages/ui` and `packages/config`.
- [ ] Root tooling: pnpm workspace, turbo tasks (`dev`, `build`, `lint`, `typecheck`, `test`, `e2e`), Biome, tsconfig bases. Pin TS version (architecture §2).
- [ ] Clerk dev instance: Google only, allowlist, Convex integration. Add `convex/auth.config.ts`, `ConvexProviderWithClerk`, and `src/proxy.ts`.
- [ ] `convex/schema.ts` v1 (architecture §5.2); `lib/functions.ts` wrappers; `lib/errors.ts`; `seed:bootstrap`.
- [ ] `members.me` + "Not invited" screen.
- [ ] `shared/money` with tests (paisa, lakh formatting).
- [ ] `shared/dates` with tests: NPT today, BS↔AD, formatBs ne/en, monthOf, fiscalYearOf, and the range alarm test.
- [ ] `shared/i18n`: typed `ne`/`en` dictionaries and `t()`, seeded from the ui-ux §8 copy deck.
- [ ] `packages/ui`: `theme.css` tokens, fonts (Baloo 2, Mukta), `BigButton`, `Chip`, `Sheet`, `NumPad`, `AmountText`, `BsDateText`, `LedgerStrip`, `Stamp`.
- [ ] PWA: manifest (name "मेरो पसल", icons, standalone, portrait), Serwist service worker with app-shell precache.
- [ ] Deploy pipeline: Vercel project (root `apps/web`) and Convex prod. **Binayak runs the prod steps.**
- [ ] Redmi smoke test: install from Chrome, sign in, reopen from the icon, confirm no login prompt.

### M1 — Capture core (≈ 1 week) · F-02, F-03, F-04, F-05, F-10

**Exit:** a named bill with amount is captured online in ≤ 15 s on the Redmi.

- [ ] Image worker: orientation, resize to ≤1600 px, JPEG ~0.72, 320 px thumbnail, EXIF strip; tests with sample photos.
- [ ] Capture state machine (`photo → preview → party → amount → saving → saved`), add page (≤ 5), retake, leave-without-saving guard.
- [ ] `shared/names`: `transliterate`, `phoneticKey`, `matchParties` + a fixture set of 50 Nepali names.
- [ ] `parties.listForPicker`, `parties.create` (idempotent), `parties.similar`.
- [ ] Name picker UI: walk-in row, recent, search, new-name sheet, duplicate prompt, "Later".
- [ ] Amount pad with lakh display, ≥ 5 lakh confirm, "Add amount later".
- [ ] Date chip and sheet: today, yesterday, day before, BS picker (≤ 90 days back).
- [ ] `shared/ledger.contribution()` + `convex/lib/ledger.apply()` + `dailySummaries` and `partyMonthly` upserts.
- [ ] `transactions.createFromClient` (idempotent) + ledger **invariant test**.
- [ ] Today: header, two big buttons, ledger strip, recent 5; the stamp moment.
- [ ] Language switch persisted to `members.locale`.
- [ ] **Voice spike (1 h):** Buwa says 20 real customer names into a bare test page (Web Speech API, `ne-NP`) on the Redmi. Record the hit rate and decide OD-5 (F-24 in v1.0 or v1.1).

### M2 — Offline and sync (≈ 1 week) · F-09

**Exit:** the F-09 acceptance tests pass on the Redmi and in Playwright.

- [ ] Dexie DB: `outbox`, `drafts`, `parties`, `recentTx`; `navigator.storage.persist()`.
- [ ] Sync engine: FIFO; parties before the bills that reference them; per-page upload with recorded storageIds; backoff; triggers (enqueue, open, online, visibility, 60 s).
- [ ] `useCachedQuery`; Today and the picker working from cache while offline.
- [ ] Draft restore after tab kill.
- [ ] Sync pill (ok / pending / offline / failed) + details sheet with "Try now".
- [ ] Offline shell not gated on Clerk (architecture §8.4).
- [ ] `members.heartbeat` → `lastSeenAt` / `lastSyncAt`.
- [ ] Playwright: offline capture ×5 → reconnect → exactly 5 on the server.
- [ ] Manual: airplane mode + app kill + cold start on the Redmi.

### M3 — Browse and fix (≈ 4–5 days) · F-06, F-07, F-08, F-15

**Exit:** UC-07 and UC-08 pass.

- [ ] Bills list: BS date groups, filters (all / sold / bought / no amount), search, infinite scroll, thumbnails only.
- [ ] Accounts list (customers / suppliers tabs, this month from `partyMonthly`) and the account page.
- [ ] Bill detail: zoom and pinch, page dots, ledger-line fields.
- [ ] Correct (account, amount, date, type) and remove (confirm + 6 s undo) through the outbox; permission matrix.
- [ ] Audit entries for every change; `audit.listForEntity`.

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
