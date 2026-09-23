# Mero Pasal — AI Workflow Rules

> How AI coding agents (Claude Code in Cursor, Cursor's own agent, or any other) work in this repo.
> `AGENTS.md` is the entry point. This file is the detailed playbook.

## 1. How the tools find these rules

| Tool | Reads automatically | How it gets the rest |
|---|---|---|
| Claude Code (terminal or Cursor extension) | `CLAUDE.md`, which imports `@AGENTS.md` | Follows the links in AGENTS.md on demand |
| Cursor agent | `AGENTS.md` | Same |
| Anything else | Point it at `AGENTS.md` first | Same |

**Keep one source of truth.** Never copy rules into tool-specific files. `CLAUDE.md` holds only Claude-Code-specific notes below its import line.

## 2. Session rituals

**At the start of every session:**
1. Read `AGENTS.md`, then `docs/progress-tracker.md` → **Current focus**.
2. Read the spec section for the feature you're touching (`product-spec.md`, F-xx), and only the docs the routing table in AGENTS.md points to.
3. Restate the task in 2–4 lines with the spec ID(s), and list the files you expect to touch.

**At the end of every session:**
1. Run `pnpm lint && pnpm typecheck && pnpm test` (and `pnpm e2e` if UI flows changed).
2. Update `docs/progress-tracker.md`: tick tasks, add a session-log line, note blockers.
3. If you made or changed a structural choice, add or amend an ADR in `docs/decisions.md`.
4. Summarise for Binayak:
   - what changed
   - what to test manually (on the phone, if UI)
   - open questions

## 3. Plan before code

**Use a written plan first** (Claude Code plan mode, or a checklist in chat) whenever the task touches any of:
- the **schema** (`convex/schema.ts`)
- **auth or permissions** (`lib/functions.ts`, role checks, `proxy.ts`)
- the **outbox or sync engine** (`features/sync/*`)
- **money or ledger maths** (`shared/money`, `shared/ledger`, `convex/lib/ledger.ts`)
- **dates** (`shared/dates`)
- **deleting or migrating** data

The plan lists the approach, affected files, tests to add, and risks. **Wait for Binayak's OK before implementing.**

For everything else (a component, copy change, small query), proceed in small steps and show the diff.

## 4. Stop and ask when…

- The spec doesn't cover the behaviour, or two docs disagree. Quote both and ask which wins.
- A change would add a runtime dependency.
- A change would alter Buwa's capture flow: its steps, number of taps or wording.
- A change would require a data migration or touch production data.
- You're about to work around a failing test instead of fixing the cause.
- You'd need a secret, a dashboard setting (Clerk, Convex, Vercel) or a prod command. Describe what Binayak should do instead.

Asking is cheap; a wrong assumption in the ledger or sync code is expensive.

## 5. Hard rules

1. **Never run production commands:** `convex deploy`, `convex run` against prod, `vercel --prod`, or data imports and exports. A human runs these.
2. **Never hard-delete** transactions, parties or photos in code paths. Use soft delete, merge or archive.
3. **Never read or write money or dates without the shared helpers** (`@mero-pasal/shared/money`, `@mero-pasal/shared/dates`).
4. **Never accept `shopId` from the client**, and never bypass the auth wrappers.
5. **Never write to `transactions` outside `ledger.apply`.**
6. **Never hard-code user-facing strings.** Add keys to both `ne.ts` and `en.ts`. If you're unsure of the Nepali, write your best version and mark it `// i18n-review` so Binayak checks it.
7. **Never edit `convex/_generated/*`** or lockfiles by hand.
8. **Never commit secrets** or print env values into logs.
9. **Never silence** a type error, lint rule or failing test without an explanatory comment and a tracker note.
10. **Keep Buwa's app offline-safe:** no capture-path feature may require the network to complete.

## 6. Task recipes

### Add a Convex function
1. Pick the wrapper (member, owner or admin) from the role matrix in architecture §10.
2. Add `args` and `returns` validators, and use indexes (§3 of code-standard).
3. Write the `convex-test` tests: happy path, auth failure, one edge case.
4. If it writes transactions, go through `ledger.apply` and extend the invariant test.
5. Update the function catalogue in `architecture-context.md` §6.

### Change the schema
1. Plan first (§3). Changes must be backward-compatible: new fields optional → backfill with an internal mutation → tighten later.
2. Update the draft schema in `architecture-context.md` §5.2 and the ER diagram if the relationships change.
3. Add an ADR if the change reflects a new decision.

### Add a screen or UI element to Buwa's app
1. Find it in `ui-ux-context.md` §5 and the mockup. If it isn't there, stop and ask.
2. Use tokens and `packages/ui` primitives; tap targets ≥ 48 px, primary ≥ 64 px.
3. Add i18n keys (ne + en) and the loading, empty, offline and error states (ui-ux §7).
4. Check at a 393 px viewport and at 130% font scale.

### Add or change copy
1. Add the key to `ne.ts` and `en.ts`, and to the copy deck in `ui-ux-context.md` §8 if the text is user-visible.
2. Keep action names consistent (Save → Saved; Remove → Removed).

### Fix a bug
1. Write a failing test that reproduces it.
2. Fix the cause.
3. Note it in the tracker's session log with the spec ID.

## 7. Definition of done

A task is done when:
- [ ] It matches the spec acceptance criteria for the F-xx, or the spec was updated deliberately.
- [ ] Lint, typecheck and tests pass; new logic has tests.
- [ ] No hard-coded strings; both languages exist.
- [ ] Loading, empty, offline and error states are handled (UI tasks).
- [ ] Docs touched by the change are updated in the same commit (architecture, spec, ui-ux, decisions).
- [ ] `progress-tracker.md` is updated.
- [ ] For UI: Binayak has a manual test note ("on the phone: …").

## 8. Working style

- **Small steps.** Implement one sub-task, run the tests, show the result, then continue. Prefer several small commits over one large one.
- **Read before you write.** Search for existing helpers (`shared/*`, `packages/ui`) before creating new ones.
- **Explain trade-offs briefly** when there are real alternatives, then recommend one.
- **Don't gold-plate.** Build the release in `progress-tracker.md` → Current focus, not features from later releases, even if they look easy. The data model already leaves room for them.
- **Keep context lean** (Claude Code): `/clear` between unrelated features; hand off to a fresh session with a short summary rather than dragging a long one.
- **Reviews:** for ledger, sync or auth changes, ask for (or run) a second-pass review focused only on correctness and invariants before merging.

## 9. Prompt templates for Binayak

Copy, fill in and paste.

**Start a feature**
```text
Current focus is F-0X (<name>). Read AGENTS.md, progress-tracker, and product-spec F-0X.
Propose a plan: files, steps, tests, risks. Don't write code until I approve.
```

**Continue after approval**
```text
Plan approved. Implement step 1 only, run the relevant tests, show me the diff and results.
```

**UI from mockup**
```text
Build <screen> per ui-ux-context §5.x and docs/mockups/father-app.html (screen "<id>").
Use tokens/primitives only, add ne/en keys, handle loading/empty/offline/error.
Tell me exactly what to check on the Redmi afterwards.
```

**Bug**
```text
Bug: <what happened, steps, expected>. Write a failing test first, then fix the cause.
Update the tracker's session log.
```

**End of session**
```text
Wrap up: run lint/typecheck/tests, update progress-tracker (tasks, session log, blockers),
add an ADR if we made a structural choice, then summarise what I should test on the phone.
```
