# AGENTS.md — Mero Pasal

Mero Pasal (मेरो पसल) is a phone-first PWA that turns a small Kathmandu grocery shop's paper bills into a searchable digital bill book.
- **Primary user:** Buwa (shop owner). He photographs each bill, picks a name and enters an amount; it must feel faster than paper.
- **Admin:** Binayak (the developer) cleans up data in `/admin`.
- **Stack:** Turborepo + pnpm monorepo · Next.js 16 PWA · Convex (DB, functions, files) · Clerk (Google, invite-only) · Tailwind 4.

## Golden rules
1. **Capture never blocks.** Buwa's save path must work offline and must never require a name, an amount, AI or the network.
2. **Spec first.** Build only what `docs/product-spec.md` describes for the release in *Current focus*. Cite `F-xx` IDs in commits and tests.
3. **Money** is integer paisa via `@mero-pasal/shared/money`. **Dates** are BS strings plus NPT via `@mero-pasal/shared/dates`. No exceptions.
4. **Every Convex public function** uses the auth wrappers in `convex/lib/functions.ts`. Never take `shopId` from the client.
5. **Every write to `transactions`** goes through `ledger.apply()` (summaries, balances, audit). No hard deletes.
6. **No hard-coded UI strings.** Add keys to both `ne.ts` and `en.ts`; Nepali is the default.
7. **Use design tokens** from `packages/ui` only. Primary tap targets ≥ 64 px, all targets ≥ 48 px.
8. **Plan first and wait for approval** for any change to schema, auth, sync/outbox, money/ledger, dates or data migration.
9. **Never run production commands** (`convex deploy`, prod `convex run`, `vercel --prod`) and never commit secrets.
10. **Before finishing:** lint, typecheck and test pass, touched docs are updated, and `docs/progress-tracker.md` is updated.

## Repo map
```text
apps/web/                Next.js 16 PWA — Buwa's app at / and admin at /admin
  src/app/               routes: (app) group = Buwa, admin/ = Binayak
  src/features/          today · capture · bills · accounts · admin · sync
  src/proxy.ts           Clerk route protection (Next 16 name for middleware)
packages/backend/convex/ Convex schema + functions (lib/ = auth wrappers, ledger, errors)
packages/shared/src/     pure TS: money · dates · names · ledger · i18n · domain
packages/ui/src/         React primitives + Tailwind theme tokens (styles/theme.css)
packages/config/         tsconfig bases
docs/                    specs, architecture, rules, tracker, mockups
```

## Commands
Use `just` (run `just` alone for the full list; recipes are in `/justfile`):
```bash
just setup        # pnpm install + Playwright browser
just env-check    # are the local env files filled in? (never prints values)
just dev          # web + Convex dev watcher in this terminal (Ctrl+C stops)
just run / stop   # same, in the background; `just status`, `just logs`, `just restart`
just check        # lint + typecheck + unit tests (what every PR needs)
just e2e          # Playwright, mobile viewport
just convex-push  # push backend to the Convex *dev* deployment once
just data members # read a dev table
just sync         # gt sync after merges
```
The pnpm scripts underneath still work (`pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`). There are no production recipes on purpose (rule 9).

## Read before you touch…
| If your task involves | Read |
|---|---|
| Anything (start here) | `docs/progress-tracker.md` → Current focus |
| What to build and acceptance criteria | `docs/product-spec.md` (F-xx) |
| How users move through it | `docs/use-cases.md` |
| Schema, functions, sync, auth, deploy | `docs/architecture-context.md` |
| Screens, tokens, copy, states | `docs/ui-ux-context.md` + `docs/mockups/*.html` |
| Code conventions | `docs/code-standard.md` |
| How to work: rituals, recipes, stop-and-ask, done | `docs/ai-workflow-rules.md` |
| Why something is the way it is | `docs/decisions.md` |
| Product context and glossary (udharo, BS, NPT, paisa…) | `docs/project-overview.md` |

## Definition of done (short)
The spec acceptance criteria are met · tests are added and passing · ne and en strings both exist · loading, empty, offline and error states are handled · docs are updated · the tracker is updated · Binayak has a "test this on the phone" note.
