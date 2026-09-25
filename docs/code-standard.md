# Mero Pasal — Code Standard

> These conventions are for humans and AI agents alike. Biome and TypeScript enforce what they can; this file covers the rest.
> When a rule here conflicts with a library's docs, follow the library for mechanics and this file for conventions, then note the conflict in `decisions.md`.

## 1. TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Shared bases live in `packages/config/tsconfig.*.json`.
- **No `any`.** Use `unknown` and narrow. The only exception is a narrow cast at a third-party boundary, with a `// biome-ignore` comment explaining why.
- **No `enum`.** Use `as const` objects or string-literal unions, derived from Convex validators where possible:
  ```ts
  import type { Infer } from "convex/values";
  import { txKind } from "@mero-pasal/backend/convex/schema";
  export type TxKind = Infer<typeof txKind>;
  ```
- Prefer `type` over `interface` unless declaration merging is needed.
- Use named exports only. The one exception is the default exports Next.js requires (pages, layouts, `proxy.ts`).
- No barrel files (`index.ts` re-exporting everything) inside apps; they bloat bundles. Packages expose explicit `exports` subpaths in `package.json` (`@mero-pasal/shared/dates`, `@mero-pasal/shared/money`, …).

## 2. Naming

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `party-picker.tsx`, `use-cached-query.ts` |
| React components | PascalCase | `PartyPicker` |
| Hooks | `useX` | `useOutboxCount` |
| Convex modules | camelCase noun | `transactions.ts` |
| Convex functions | verb-first camelCase | `createFromClient`, `listByParty` |
| Tables | camelCase plural | `parties`, `dailySummaries` |
| Money fields | suffix `Paisa` | `amountPaisa`, `creditPaisa` |
| BS date strings | suffix `Bs` | `dateBs: "2083-06-07"`, `monthBs: "2083-06"` |
| Timestamps (ms) | suffix `At` | `capturedAt`, `updatedAt` |
| AD day anchor | suffix `Ad` | `dateAd` |
| Booleans | `is/has/needs` prefix | `isWalkIn`, `needsAttention` |
| i18n keys | dot.path, lowercase first | `party.walkIn` |
| Spec references | `F-xx` / `NFR-xx` / `ADR-xxx` | in commits, TODOs, test names |

Domain words: code says `party`, `transaction`, `sale`, `purchase`; the UI says खाता, बिल, बेचेको, किनेको. Don't mix them. No `customerBill`, no `inwardInvoice`.

## 3. Convex backend

1. **Build every public function from the wrappers** in `convex/lib/functions.ts` (`memberQuery`, `memberMutation`, `ownerMutation`, `adminQuery`, `adminMutation`, `optionalMemberQuery` for `members.me` only, and `optionalMemberMutation` for `members.claimInvite` only). Importing `query`/`mutation`/`action` from `_generated/server`, or `queryGeneric`/`mutationGeneric`/`actionGeneric` from `convex/server`, in feature modules is lint-blocked. Biome can't see through a namespace import (`import * as server from "./_generated/server"`), so those are banned by review.
2. **Validate every argument** with `v.*`. Add `returns` validators on public functions.
3. **Never accept `shopId` as an argument.** Use `ctx.shopId` from the wrapper.
4. **Indexes, not filters.** Use `.withIndex(...)` for any table that grows. `.filter()` is allowed only on already-bounded results. Every list is paginated (`paginationOptsValidator`) or `.take(n)` with an explicit bound.
5. **Transactions write through the ledger.** Any insert, update, remove or restore on `transactions` goes through `ledger.apply(ctx, before, after)`. Never `ctx.db.insert("transactions")` elsewhere.
6. **Idempotent creates.** Client-originated creates take `clientId` (`crypto.randomUUID()`, generated on the device) and return the existing id on a repeat.
7. **Time.** Mutations may use `Date.now()` for `capturedAt`/`updatedAt`. **Queries must not** derive "today" from `Date.now()`; accept `dateBs` from the client and validate it.
8. **Actions** exist only for external calls (v2 AI, speech). Actions never write to the DB directly; they call `internal` mutations. Add `"use node"` only in files that need Node.
9. **Errors.** Throw `new ConvexError({ code, message })` using the codes in `lib/errors.ts`. Never throw bare strings.
10. **Generated code.** Never edit `convex/_generated/*`.
11. **Schema changes** must be backward-compatible: add optional fields first, backfill with an internal mutation, then tighten. Record each step in `decisions.md`.

```ts
// Shape of a typical mutation
export const update = memberMutation({
  args: { id: v.id("transactions"), patch: txPatch },
  returns: v.null(),
  handler: async (ctx, { id, patch }) => {
    const before = await getOwnedTx(ctx, id);           // NOT_FOUND / shop check
    assertCanEdit(ctx.member, before);                    // F-08 permission matrix
    const after = { ...before, ...normalisePatch(patch), updatedAt: Date.now() };
    await ledger.apply(ctx, before, after);               // summaries + balances + audit
    return null;
  },
});
```

## 4. Shared domain (`packages/shared`)

- **Pure functions only.** No DOM, Node, Convex, React or `Date.now()` without an injectable `now` parameter.
- **Money:** only `@mero-pasal/shared/money`. Use `rupeesToPaisa`, `sumPaisa` and `formatNpr`. Never multiply or divide floats for money; never `toFixed` for display.
- **Dates:** only `@mero-pasal/shared/dates`. Use `todayBs(now)`, `bsToAdMs`, `adMsToBs`, `formatBs`, `monthOf` and `fiscalYearOf`. Never call `new Date(...).toISOString().slice(0, 10)`, and never import `nepali-date-converter` outside `shared/dates`.
- **Names:** only `@mero-pasal/shared/names`. Use `phoneticKey`, `transliterate` and `matchParties`.
- Every exported function has a JSDoc line and unit tests. `dates`, `money`, `names` and `ledger` target 100% branch coverage.

## 5. Web app (Next.js 16, React 19)

- **Buwa's screens are client components.** Put `"use client"` at the top of route files in the `(app)` group. Server components are used only for static layouts and metadata.
- **Feature folders** (`src/features/<feature>/`) own their components, hooks, state and tests. Promote something to `packages/ui` only when a second feature needs it *and* it contains no domain logic.
- **Data access** goes through hooks in the feature: `useTodaySummary()`, `usePartiesForPicker()`. Components don't call `useQuery(api...)` directly. Offline-capable reads use `useCachedQuery`.
- **Writes from Buwa's app go through the outbox** (`features/sync/outbox.ts` → `enqueue()`), never straight to `useMutation`, so offline behaviour is uniform. Admin console writes may call mutations directly. Exception: `members.setLocale` (a preference, not shop data) is called directly.
- **The capture flow is a state machine** (a reducer with explicit states `photo → preview → party → amount → saving → saved`). Don't spread boolean flags across components.
- **Components** stay under ~200 lines, have props typed inline, and hold no business logic: call shared domain functions instead.
- **Styling:**
  - Tailwind utilities with theme tokens only (`bg-sale`, `text-ink-soft`). No arbitrary hex (`bg-[#1E7A4C]`).
  - Tap targets: use `min-h-16` for primary actions and `min-h-12` otherwise.
  - Tailwind v4: shared tokens come from `@import "@mero-pasal/ui/styles/theme.css"`, and add `@source` for `packages/ui` so its classes are scanned.
- **i18n:** every user-facing string comes from `t("key")`. The `en` dictionary is typed as `Record<keyof typeof ne, string>`, so a missing translation is a compile error. No string concatenation for sentences; use `{n}`-style params.
- **Images:** lists render thumbnails only (`thumbId`). Use `loading="lazy"` and explicit `width`/`height`.
- **Performance:** keep Buwa's routes ≤ 250 KB of gzipped JS. Import heavy admin-only libraries (Excel, charts) dynamically inside `/admin`.

## 6. Accessibility

- Every interactive element is a real `<button>` or `<a>`, never a clickable `<div>`.
- Icon-only buttons have `aria-label` from i18n.
- Respect `prefers-reduced-motion`.
- Include a test for 130% font scaling on key screens (Playwright with a zoomed viewport).

## 7. Testing

| Package | Runner | Location | Rule |
|---|---|---|---|
| `shared` | Vitest | `src/**/x.test.ts` beside the code | Tests before or with the code; edge dates and names are mandatory |
| `backend` | Vitest + `convex-test` | `convex/**/*.test.ts` | Each public function: happy path, auth failure, one edge case. Ledger invariant test required. |
| `web` | Playwright | `apps/web/e2e/` | Capture happy path, offline sync, language switch; mobile viewport 393×851 |

- Signed-in e2e tests (e.g. `offline-sync.spec.ts`, the F-09 exit test) sign in as the Clerk **dev** test user `…+clerk_test@…` via `@clerk/testing` and use the Convex **dev** deployment. They need `CLERK_SECRET_KEY` in `apps/web/.env.local` and the functions pushed (`just convex-push`); without the key they skip. The test user has its own shop (`e2eSupport:ensureE2eShop`), so test bills never touch the real shop.
- Test names cite spec IDs: `it("F-03: saves to outbox before showing stamp")`.
- No snapshot tests of whole screens. Assert behaviour.
- Bugs get a failing test first.

## 8. Formatting and linting

- Biome for formatting and linting, config in the root `biome.json`: 2 spaces, double quotes, semicolons, line width 100.
- `pnpm lint` and `pnpm typecheck` must pass before commit (Husky or lefthook pre-commit).
- Imports are ordered by Biome's organise-imports. There are no relative imports across packages.

## 9. Git, Graphite and commits

- **Remote:** `github.com/BinayakDotel/mero-pasal` (private). Trunk is `main`; nothing is committed to `main` directly after the M0 baseline.
- **Graphite (`gt`) stacks the work** (ADR-027). One logical change is one branch is one PR. A change that depends on an unmerged one stacks on top of it.
- Branch names: `feat/F-03-amount-pad`, `fix/F-09-duplicate-upload`, `docs/arch-outbox`, `chore/M0-tooling`.
- Everyday commands:

  | Do | Command |
  |---|---|
  | New branch + commit from staged changes, stacked on the current branch | `gt create feat/F-xx-name -m "feat(scope): F-xx …"` |
  | Amend the current branch after review feedback (restacks children) | `gt modify` (or `gt modify -c -m "…"` for an extra commit) |
  | Open or update PRs for the whole stack | `gt submit --stack` |
  | Pull `main`, drop merged branches, restack | `gt sync` |
  | See the stack | `gt log short` |
  | Move between branches | `gt up` / `gt down` / `gt checkout` |

- **Small PRs in one stack** (Binayak's rule, 2026-09-24). Break every feature into small PRs, each one step that reads in one sitting (aim for under ~300 changed lines, excluding lockfiles and generated files), and submit them together as one Graphite stack. Never bundle a whole feature, or a feature plus its fixes, into one big PR.
  - Typical split: schema → backend functions + tests → shared logic + tests → UI → e2e → docs. Schema, auth, ledger and sync changes each get their own PR so they can be reviewed on their own.
  - Each PR in the stack passes `just check` on its own and says in its description where it sits in the stack (e.g. "3/5") and what the next PR adds.
  - A bug found while building goes in its own small PR in the stack (with its failing test), not folded into an unrelated one.
- PR descriptions list the spec IDs, what to test (on the phone for UI), and any doc or ADR touched.
- **No AI co-author trailers.** Commit messages never include `Co-Authored-By: Claude …` (or any other AI tool). Binayak is the author of record.
- Conventional commits with the spec ID:
  - `feat(capture): F-03 add amount pad with lakh formatting`
  - `fix(sync): F-09 skip re-upload when storageId recorded`
- One logical change per commit. Schema changes go in their own commit.
- **Never commit secrets.** `.env*` is git-ignored; `.env.example` documents keys without values.

## 10. Dependencies

- Prefer platform APIs and existing dependencies.
- Each new runtime dependency needs one line in `decisions.md`: what it is, why, its size, and the alternative considered.
- Pin exact versions. Renovate or manual updates happen monthly, never mid-feature.

## 11. Comments and docs

- Comment *why*, not *what*. Link spec IDs for non-obvious behaviour: `// F-04: walk-in cannot take udharo (v1.1)`.
- If you change behaviour described in `docs/`, update the doc in the same commit.
- `TODO(F-xx): …` is allowed only if the item is also listed in `progress-tracker.md`.
