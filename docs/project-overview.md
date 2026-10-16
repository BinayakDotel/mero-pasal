# Mero Pasal — Project Overview

> **Mero Pasal** (मेरो पसल, "my shop") is the product name; it was renamed from the working name "Hisab" on 2026-09-23. The code scope is `@mero-pasal/*`.
> This file answers *what* and *why*. For *how*, see `architecture-context.md`. For *exactly what to build*, see `product-spec.md`.

## In one sentence

Mero Pasal is a phone app that turns a small grocery shop's paper bills into an organised, searchable digital bill book. It is built first for one shop, Buwa's kirana pasal in Kathmandu.

## The problem today

| Area | How it works now | What hurts |
|---|---|---|
| Sales bills | ~50 handwritten bills a day. Only larger sales get a bill. Some are in a pre-printed bill book, some on blank paper. Nepali or English, sometimes hard to read. | Finding a customer's past bills means flipping through books. Nobody knows per-customer totals. |
| Purchase bills | 4–5 computer-printed supplier invoices a day | Nobody knows per-supplier totals or monthly spend. |
| Udharo (credit) | Handwritten register. Roughly NPR 5–10k of ~30k daily sales goes to udharo, only for regular customers. | Balances are slow to check and easy to get wrong. |
| Payments | About 50/50 cash and Fonepay QR. Buwa copies each day's QR total from the Fonepay app by hand. | This is double work, and QR totals are never joined up with sales. |
| Returns and damages | Returned or exchanged on the next delivery. Nothing is recorded. | Losses are invisible. |
| Result | | Profit and loss is guesswork. Nobody can say who the valuable customers are. |

## Users

| Persona | Role in app | Uses Mero Pasal to… | Device |
|---|---|---|---|
| **Buwa** (father) | `owner` — primary user | Photograph bills and file them under a name; look up a customer's bills; see today's numbers | Redmi 15C (Android), Chrome, installed as a PWA |
| **Aama** (mother) | `staff` — optional | Nothing required in v1. She keeps paper records and Buwa enters them later, which is why back-dating a bill is supported. | — |
| **Binayak** | `admin` — builder and back-office | Review and fix data, merge duplicate names, export, read reports, collect Buwa's feedback | Laptop and phone |

Buwa already photographs bills and does calculations on his phone. Mero Pasal builds on exactly those two skills.

## Product principles

These rules are not broken.

1. **Digitise his habit; don't replace it.** He keeps writing bills. Mero Pasal photographs and files them.
2. **Capture is instant; everything else can wait.** Nothing blocks saving a bill: not a name, not an amount, not the internet, not AI.
3. **Big, few, obvious.** One decision per screen, huge tap targets, everyday Nepali words (बेचेको / किनेको, not formal accounting terms).
4. **Never lose a bill.** A photo is stored on the phone *before* the app says "saved".
5. **Buwa captures, Binayak cleans up.** Merges, corrections and missing data are handled in the admin console, not on Buwa's phone.
6. **Earn each feature with feedback.** Ship small, watch him use it, then iterate.

## Releases

| Release | Name | Adds | Status |
|---|---|---|---|
| **v1.0** | Bill Book | Photograph sale and purchase bills and file them under a name, with optional amount and date. Also: bill list, per-name account pages, today's totals, offline capture, admin fixes, CSV export. | **Current target** |
| v1.1 | Hisab | Udharo: payment status, money received and paid, balances, opening balances copied from the register. Also: day close (total sales, Fonepay QR total) and voice name search. | Planned |
| v1.2 | Reports | Collective ledger of all transactions, monthly and fiscal-year reports, customer statements shared on WhatsApp, Excel and printable exports | Planned |
| v2.0 | Smart | AI reads amount, date, bill number and name as *suggestions*. Also: supplier auto-match by PAN, duplicate detection, review queue. | Later |
| Later | — | Profit and loss, stock, Fonepay statement import, multi-shop / productisation | Ideas |

Detailed scope and acceptance criteria are in `product-spec.md`.

## Non-goals for v1

- **Issuing or printing bills.** That is IRD e-billing / CBMS territory; Mero Pasal *records* bills and does not issue them.
- **AI extraction of anything.** The data model leaves room for it (v2).
- **Items, stock or inventory.**
- **Double-entry accounting, VAT returns.**
- **Multiple shops, subscriptions, payments.** `shopId` still exists on every table as cheap insurance.
- **A Play Store app.** Mero Pasal is a PWA installed from Chrome.

## What success looks like at 3 months

- Every written bill reaches Mero Pasal the same day (bills captured ≈ bills written).
- Buwa finds any customer's bills in under 10 seconds.
- Monthly totals per customer and per supplier exist without anyone adding them up by hand.
- After v1.1, the udharo register is retired and Buwa trusts the balances.
- Buwa still chooses to use the app after the two-week trial.

## Glossary

| Term | Meaning | In code |
|---|---|---|
| Bill (बिल) | A sale or purchase record with one or more photos | `transactions` row with `kind` `sale` or `purchase` |
| Sale bill — बेचेको बिल | Bill for goods sold to a customer ("outward") | `kind: "sale"` |
| Purchase bill — किनेको बिल | Bill for goods bought from a supplier ("inward") | `kind: "purchase"` |
| Account — खाता | A named person or business: customer (ग्राहक) or supplier (सप्लायर). The UI says "name" and "account"; the code says "party". | `parties` |
| Walk-in — नगद ग्राहक | Built-in account for sale bills with no name | `parties.isWalkIn = true` |
| Udharo (उधारो) | Credit given to a customer (v1.1) | `creditPaisa`, `parties.balancePaisa` |
| Day close — दिनको हिसाब | End-of-day totals: all sales including unbilled ones, plus QR received (v1.1) | `dayCloses` |
| BS | Bikram Sambat, the Nepali calendar. All dates are *shown* in BS. | `dateBs: "2083-06-07"` |
| Fiscal year (FY) | Shrawan 1 to end of Ashadh. FY 2083/84 began on 17 July 2026. | `fiscalYearOf(dateBs)` |
| NPT | Nepal Time, UTC+05:45. "Today" always means today in NPT. | `todayBs()` |
| Paisa | 1/100 rupee. All money is stored as integer paisa. | `amountPaisa` |
| Fonepay | QR payment network the shop uses | v1.1 manual entry, later import |
| PAN | 9-digit Permanent Account Number. The shop is PAN-registered, not VAT-registered. | `shops.pan`, `parties.pan` |
| Outbox | On-device queue of actions not yet synced to the server | Dexie table `outbox` |

## Compliance context

This is background only, not legal advice; confirm with the shop's accountant.

- The shop is PAN-registered. VAT registration becomes mandatory above NPR 50 lakh annual turnover for goods businesses. If the shop crosses that, VAT fields become relevant (v2+).
- IRD e-billing approval and CBMS apply to software that *issues* invoices, and the mandatory thresholds are far above this shop's scale. As a record-keeper, Mero Pasal stays out of that scope. **Do not add bill-issuing without revisiting this.**
- Tax records must be kept for 6 years. **Mero Pasal never auto-deletes bills or photos.**

## Where things live

| Need | File |
|---|---|
| Public overview (screenshots, stack, license) | `/README.md` |
| Rules for AI agents and the repo map | `/AGENTS.md` (Claude Code reads it through `/CLAUDE.md`) |
| Features and acceptance criteria | `docs/product-spec.md` |
| End-to-end scenarios | `docs/use-cases.md` |
| System design, data model, flows | `docs/architecture-context.md` |
| Visual and interaction rules, copy | `docs/ui-ux-context.md` |
| Coding conventions | `docs/code-standard.md` |
| How AI agents should work | `docs/ai-workflow-rules.md` |
| What's done and what's next | `docs/progress-tracker.md` |
| Why things are the way they are | `docs/decisions.md` |
| Clickable concept mockups | `docs/mockups/*.html` |
| All diagrams rendered on one page | `docs/diagrams.html` |
