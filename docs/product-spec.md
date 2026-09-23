# Mero Pasal — Product Spec

> This file is the source of truth for **what** to build. Every feature has an ID (`F-xx`); use it in branch names, commits and the progress tracker.
> If code and spec disagree, the spec wins until it is changed deliberately and the change is recorded in `decisions.md`.
> Status tags: **[v1.0]** build now · **[v1.1] / [v1.2]** next · **[v2]** later · **[Later]** idea.

---

## 1. Release overview

| Release | Goal | Features |
|---|---|---|
| **v1.0 Bill Book** | Every bill is photographed, filed under a name, and findable | F-01 … F-15 |
| v1.1 Hisab | Udharo and daily money, without the paper register | F-20 … F-24 |
| v1.2 Reports | The complete ledger plus monthly and yearly reports and exports | F-30 … F-33 |
| v2.0 Smart | AI suggests; humans confirm | F-40 … F-43 |
| Later | P&L, stock, Fonepay import, multi-shop | F-50 … F-53 |

---

## 2. v1.0 — Bill Book

### F-01 Sign-in and device setup **[v1.0]**

**Goal:** Binayak sets up Buwa's phone once. Buwa never sees a login screen again.

- Sign-in is Clerk with Google. It is **invite-only**: the Clerk allowlist blocks strangers, and the Convex `members` table decides access.
- Binayak creates the shop, the owner and admin members, and the built-in walk-in account using a seed command (see architecture §11).
- On Buwa's phone: open the app URL in **Chrome** (not Mi Browser), sign in, then choose **Install app** or **Add to Home screen**. The icon is labelled "मेरो पसल".
- The session persists. Re-authentication only happens if Clerk revokes the session.

**Acceptance**
- An email that isn't on the allowlist cannot sign in. A signed-in user without a member row sees a "Not invited" screen and no data.
- After installing, opening the icon lands on Today in under 2 seconds on a warm start, with no login prompt for at least 30 days.

### F-02 Today screen (home) **[v1.0]**

**Goal:** One glance shows today's billed numbers, and one tap starts a capture.

- The header shows the weekday and BS date (e.g. "बुधबार, ७ असोज"), the sync status pill (F-09) and the language switch (F-10).
- Two giant buttons, stacked:
  - **बेचेको बिल / Sold bill** (green, sale)
  - **किनेको बिल / Bought bill** (blue, purchase)
- A "today" ledger strip shows:
  - billed sales: total and count
  - purchases: total and count
  - bills without an amount: count, shown only when greater than 0
- Recent bills: the last 5 captured today, newest first. Tapping one opens the bill detail (F-08).
- Bottom navigation: **आज / Today** · **बिलहरू / Bills** · **खाता / Accounts**.

**Rules**
- The totals label must say *billed* sales ("आजका बिल"). Unbilled sales aren't in Mero Pasal until day close (F-23), so the app never pretends this is total sales.
- Totals count only `active` bills whose `dateBs` is today. A back-dated bill counts on its own date.

**Acceptance**
- After saving a bill, Today's totals and recent list update within 1 second (from the outbox if offline, from the server if online).
- Totals equal the sum of today's active bills with amounts. Bills without an amount count toward the count but not the total.

### F-03 Capture a bill **[v1.0]** — the core flow

**Goal:** Save a named bill with an amount in about 15 seconds and at most 6 taps plus digits.

**Flow**
1. **Choose type:** tap Sold or Bought on Today.
2. **Take photo:** the phone's own camera opens directly, rear camera, via the native file input.
3. **Preview:** the photo fills the screen. Actions:
   - **ठीक छ / Use photo** (primary)
   - **फेरि खिच्नुहोस् / Retake**
   - **अर्को पाना / Add page**, for multi-page supplier invoices; up to 5 pages
4. **Whose bill?** Pick a name (F-04).
5. **Amount:** a big number pad showing "जम्मा कति? / Bill total?".
   - **रकम पछि हाल्छु / Add amount later** skips this step.
   - A date chip, default "आज / Today", lets him change the date (F-05).
6. **बिल राख्नुहोस् / Save bill.** The "राखियो / Saved" stamp confirms, then the app returns to Today with the new bill highlighted.

**Rules**
- The photo is compressed on the phone to at most 1600 px on the long edge (JPEG), plus a 320 px thumbnail. EXIF data is stripped, including GPS.
- On Save, the bill is written to the on-device outbox first. The confirmation appears only after that local write succeeds (NFR-02).
- Amount is entered in whole rupees in v1 and stored as integer paisa.
- If the amount is ≥ NPR 5,00,000, ask once: "रु X — ठीक हो? / Is this right?"
- Back leaves the current step. Leaving the flow after taking a photo asks "बिल नराखी फर्कने? / Leave without saving?"
- If the phone kills the tab mid-flow, the draft (photo, type, party) is restored the next time the app opens.

**Acceptance**
- A trained user completes a named-customer bill with amount in ≤ 15 s (median of 10 attempts during the trial).
- Airplane mode: capture completes, the bill appears on Today marked pending, and it uploads automatically when the connection returns.
- The saved photo stays legible when zoomed: handwriting readable at 2× on the phone.

### F-04 Name picker and quick create **[v1.0]**

**Goal:** The right name in one tap most of the time. A new name in under 10 seconds.

- The screen title reads "कसको बिल? / Whose bill?". Sale bills show customers; purchase bills show suppliers. Accounts marked `both` appear in both lists.
- **Sale bills:** a large **नगद ग्राहक / Walk-in** option comes first.
- Below it are **Recent** accounts, sorted by last used: 8 visible, the rest on scroll. Each row shows:
  - an avatar with the first letter
  - the name, plus the tag if there is one (e.g. "राम बहादुर थापा · चोक")
  - the last bill, e.g. "हिजो · रु 2,340"
- **Search box:** typing filters instantly and matches across scripts. "binayak", "vinayak" and "विनायक" all find the same account (architecture §7.3).
- **+ नयाँ नाम / Add new name** opens a sheet:
  - **Name** (required), prefilled with the search text
  - **Phone** (optional)
  - **Tag** (optional): a place or nickname that tells people apart
  - The account kind comes from the bill type and can be changed later by admin.
- **Similar-name warning:** if the new name's phonetic key is close to an existing account, show that account and ask "उही हो? / Same person?".
  - **हो / Yes** uses the existing account.
  - **होइन, नयाँ / No, create new** creates the new one.
- **Nothing found → add exactly that name.** If a search finds no account:
  - The list shows the searched text on a card, "“Sunita Rai” नाम अहिलेसम्म छैन", with one big button: **+ “Sunita Rai” नाम थप्नुहोस्**. It opens the new-name sheet with the name prefilled.
  - Near matches, where at least one name part matches (e.g. same surname), appear below under **यीमध्ये कोही हो? / Is it one of these?**
  - When matches *do* exist, a dashed row at the end still offers **“X” अर्कै मान्छे हो? नयाँ थप्नुहोस्** (a different X? add as new).
- The step can be skipped ("पछि / Later") for purchases and in any case where he can't decide. A bill saved without a name is flagged for admin review.

**Rules**
- Names are stored as typed (`displayName`). The Latin and Devanagari forms are derived automatically, and admin can correct them.
- Accounts created offline work immediately. They sync before the bills that reference them.

**Acceptance**
- For a customer with any bill in the last 7 days, that name appears among the first 8 rows without typing.
- A search for 3 letters in either script returns the right account among the top 3 for the seeded test set of 50 realistic names (unit-tested).

### F-05 Bill date and back-dating **[v1.0]**

- The default is today in NPT.
- The date chip offers **आज / Today**, **हिजो / Yesterday**, **अस्ति / Day before**, and **अरू मिति / Pick date** (a BS calendar picker, at most 90 days back, no future dates).
- This supports Aama's paper bills being entered later by Buwa.

**Acceptance:** A back-dated bill appears under its own date in lists and totals, and not under today's.

### F-06 Bills list **[v1.0]**

- Bills are grouped by BS date, newest first, with headers like "आज · ७ असोज" and "हिजो · ६ असोज". The list loads more as he scrolls.
- Filter chips: **सबै / All** · **बेचेको / Sold** · **किनेको / Bought** · **रकम छैन / No amount**.
- Search matches the account name across scripts.
- Each row shows:
  - thumbnail
  - account name
  - amount, or a "रकम छैन" tag if missing
  - capture time
  - a coloured edge for the type
  - a pending-sync icon when relevant

**Acceptance:** 1,000 bills scroll smoothly on the Redmi 15C. Only thumbnails load in the list, never full photos.

### F-07 Account page (खाता) **[v1.0]**

- **Accounts list:** tabs **ग्राहक / Customers** and **सप्लायर / Suppliers**, with search. Each row shows the name, tag, and this month's total.
- **Account page:**
  - header with name, tag, and a call button if a phone number exists
  - this BS month's total and bill count
  - all-time total
  - the account's bills as a list with thumbnails, filterable by month
- v1.1 adds the balance card and "पैसा आयो / Money received" (F-21, F-22).

**Acceptance:** From Today, Buwa reaches any customer's bills in ≤ 3 taps plus typing.

### F-08 Bill detail, correct and remove **[v1.0]**

- The photo is shown full width with pinch or double-tap zoom, and page dots for multi-page bills.
- The fields shown are: type, account, amount, date, bill number (optional, admin-editable), captured by, and captured at.
- **सच्याउनुहोस् / Correct**: change the account, amount, date or type. Photos cannot be replaced. To replace a photo, remove the bill and capture it again.
- **हटाउनुहोस् / Remove**: a confirm sheet, then a soft delete with an **Undo** toast for 6 seconds. Removed bills leave all lists and totals, and admin can restore them.
- Permissions:
  - `owner` and `admin` can correct or remove any bill.
  - `staff` can correct or remove only their own bills, and only within 24 hours.

**Acceptance:** Every correction and removal writes an audit entry (F-15), and totals update correctly (tested invariant).

### F-09 Offline capture and sync status **[v1.0]**

- Every write action goes through the on-device outbox and is sent to the server in order. Retries back off and never duplicate: each item carries a `clientId`.
- The status pill on Today has three states:
  - **सबै सुरक्षित / All saved**
  - **३ पठाउन बाँकी / 3 waiting to upload**
  - **इन्टरनेट छैन — बिल फोनमा सुरक्षित छन् / No internet — bills are safe on this phone**
- Tapping the pill opens a sheet listing pending items, with a **Try now** button.
- The app requests persistent storage so the browser is less likely to evict the outbox.
- If an item fails 5 times with a non-network error, it shows as **पठाउन सकिएन / Couldn't upload**. It is kept and reported to admin, never dropped.

**Acceptance**
- With airplane mode on, capture 5 bills; kill the app; turn airplane mode off; reopen. All 5 bills reach the server exactly once, with photos.
- The same test also passes with a cold start while offline, as long as the app has been opened once before (best effort; see architecture §8).

### F-10 Language, numbers and dates **[v1.0]**

- **Nepali is the default UI language**, with a one-tap switch between नेपाली and English. The choice is saved per member.
- Amounts use Latin digits (Buwa uses a calculator), a "रु" prefix and lakh grouping: `रु 1,23,456`.
- Dates are shown in BS. In Nepali mode: "७ असोज २०८३" (Devanagari digits in dates only). In English: "7 Asoj 2083".
- No string is hard-coded; every UI string lives in the `ne` and `en` dictionaries.

### F-11 Admin console: bills and fixes **[v1.0]**

For Binayak, at `/admin`, desktop-first.
- **Overview:**
  - this BS month's billed sales, purchases and counts
  - the **Needs attention** queue: bills without an amount, bills without a name, possible duplicate names
  - last sync time per member
- **Bills table** with filters for date range, type, account and flags. A row opens a drawer with the photo, editable fields (including bill number and note), and the audit history. Removed bills can be restored here.

### F-12 Admin console: accounts **[v1.0]**

- Rename an account; edit its Latin and Devanagari forms, tag, phone, PAN and kind; archive it.
- **Merge:** pick a *keep* account and a *merge* account. All bills move to the kept one, the merged account is marked `mergedIntoId`, and nothing is deleted. The console suggests pairs with matching phonetic keys.

### F-13 Admin console: members **[v1.0]**

- List members with role, last-seen time and last successful sync.
- Invite (add an allowlist email plus a member row), change role, deactivate.

### F-14 Data export and backup **[v1.0]**

- Admin exports a CSV of bills for any BS date range. Columns: date BS, date AD, type, account, amount, bill number, photo count, captured by, status.
- **Monthly backup routine:** Binayak exports the month's CSV. A Convex snapshot export (built-in) is taken monthly and kept off-platform. This is documented in the progress tracker as a recurring task.

### F-15 Audit trail **[v1.0]**

- Every create, correct, remove, restore, merge and role change writes an entry: who, what, when, and a short before/after summary.
- The audit trail is visible in the admin bill drawer and account page.

---

## 3. v1.1 — Hisab (udharo and daily money)

### F-20 Payment status on bills **[v1.1]**

- **Sale bills:** the amount step shows chips **नगद / Cash** · **QR** · **उधारो / Udharo** · **केही उधारो / Part udharo**. Choosing one is required when an amount is entered.
  - Walk-in cannot take udharo or part udharo.
  - Part udharo asks "कति उधारो? / How much on udharo?"
- **Purchase bills:** chips **तिरेँ / Paid** · **बाँकी / Due** · **केही बाँकी / Part due**.
- These choices update the account balance (F-22).

### F-21 Money received and paid **[v1.1]**

- On a customer's page, **पैसा आयो / Money received** asks for the amount and mode (cash or QR) and records a `payment_in`.
- On a supplier's page, **पैसा तिरेँ / Money paid** records a `payment_out`.
- A photo is optional, for example of the register page or a receipt.

### F-22 Balances and opening balances **[v1.1]**

- Every account has a balance. A positive balance means they owe us; a negative balance means we owe them.
- The balance is shown on the account page and in the accounts list, and a **Who owes** list is sorted by balance.
- **Opening balance:** a one-time entry per account copied from the paper register, on the date he switches over. It is recorded as `opening_balance`. Admin can do this in bulk from the console.

**Acceptance:** The balance equals opening balance, plus credit given on bills, minus payments received (customer; mirrored for supplier). It is recomputed from scratch and compared in tests.

### F-23 Day close — दिनको हिसाब **[v1.1]**

- At the end of the day Buwa enters two numbers:
  - **आजको जम्मा बिक्री / Total sales today**, including unbilled sales
  - **Fonepay QR मा आएको / QR received today**, copied from the Fonepay app as he does now
- The app shows beside them: billed sales, udharo given, money received, and computed cash (total − QR − udharo given).
- It can be edited later. It is stored as a `dayCloses` row.
- *Open question:* is "total sales" or "cash counted" more natural for Buwa to enter? Validate during the v1 trial.

### F-24 Voice: find *or create* a name **[v1.1 — candidate for v1.0 after the voice spike]**

**Goal:** Buwa says a name. If it exists he taps it; if not, he creates exactly that name after one confirmation. He never has to type.

**Listen**
- A mic button sits beside the search box in the name picker.
- Tapping it opens a full-screen listening view: a large red mic, "सुन्दैछ… नाम भन्नुहोस्", and the words appearing as they are heard. **रद्द गर्नुहोस् / Cancel** closes it.

**Show what was heard**
- The heard text stays on screen in a strip: "सुनियो “गोपाल श्रेष्ठ”", with **फेरि भन्नुहोस् / Say again**.
- The heard text runs through the same cross-script matching as typing (F-04).

**If found**
- Matching accounts are listed, best first. One tap picks one and continues to the amount step.
- A dashed row still offers "“X” अर्कै मान्छे हो? नयाँ थप्नुहोस्" for a different person with the same name.

**If not found**
- A card reads "“गोपाल श्रेष्ठ” नाम अहिलेसम्म छैन", with one big button **+ “गोपाल श्रेष्ठ” नाम थप्नुहोस्**.
- Near matches (e.g. "गोपाल महर्जन", "सीता श्रेष्ठ") are listed below under "यीमध्ये कोही हो?" in case the recogniser misheard.

**Confirm, then create**
- **Add** opens the name sheet titled **नाम ठीक छ? / Is the name right?**, with the sub-line "सुनेको नाम हो। मिलेन भने सच्याएर राख्नुहोस्।"
- The heard name is prefilled and editable. The keyboard does *not* open automatically, so he reads before typing. Phone and tag stay optional.
- **नाम राख्नुहोस्** creates the account and continues to the amount step with the bill filed under the new name.
- The duplicate check from F-04 still runs inside this sheet.

**Rules**
- Voice never creates an account without the confirmation tap.
- The transcript is stored as typed, usually in Devanagari from `ne-NP`. The other script is derived as usual.
- The mic works only online, because browser speech recognition needs the network. Offline, the mic is disabled with the hint "इन्टरनेट चाहिन्छ", and typing still works.

**Acceptance**
- Saying an existing customer's name puts that account first in ≥ 80% of attempts in the spike set.
- For a new two-word name, it takes ≤ 3 taps from mic to the amount step: mic → Add → Save name.

**Implementation:**
- Start with the browser speech API (`ne-NP`, falling back to `en-IN`).
- **Voice spike (1 hour, during M1):** Buwa says 20 real customer names at the counter on the Redmi.
  - If ≥ 80% come back usable, pull F-24 into v1.0. It has no running cost.
  - If not, keep it for v1.1 and test a speech-to-text API through a Convex action instead.

---

## 4. v1.2 — Reports

### F-30 Collective ledger **[v1.2]**

- One chronological ledger of **all** transactions (sales, purchases, payments, openings, adjustments), filterable by date range, account and kind.
- Running totals are shown, laid out like a bahi: date · details · account · sold · bought · received · paid.

### F-31 Monthly and fiscal-year reports **[v1.2]**

- **Month (BS):** totals by kind, day-by-day table, top customers and suppliers by amount, udharo given and collected, day-close totals, and QR vs cash.
- **Fiscal year:** the same data by month (Shrawan…Ashadh), plus year totals.
- Reports are built from daily summaries, so they stay fast at any size.

### F-32 Account statement share **[v1.2]**

- From an account page: **विवरण पठाउनुहोस् / Send statement** creates an image or PDF of the account's bills and payments for a period with the closing balance, then opens the Android share sheet (WhatsApp).

### F-33 Excel and printable exports **[v1.2]**

- Excel export of the ledger, sales register and purchase register for any period, for the accountant.
- Printable HTML reports ("Save as PDF" from the browser); see decision ADR-017 on Devanagari rendering.

---

## 5. v2.0 — Smart (AI assist)

All AI output is a **suggestion**. It never overwrites something a human entered, and it never blocks capture.

| ID | Feature | Notes |
|---|---|---|
| F-40 | Read amount, date, bill number and name from photos | Runs in the background after upload. Empty fields get prefilled suggestions; conflicts go to review. |
| F-41 | Supplier auto-match by PAN | Printed invoices carry the supplier's PAN; match it to `parties.pan` |
| F-42 | Duplicate bill detection | Same photo, or same account + amount + date + bill number |
| F-43 | Review queue | Low-confidence or conflicting items appear in the admin **Needs attention** list |

**Before building F-40:** run the extraction spike, a labelled set of 60+ real photos scored across 2–3 models. See architecture §15.

## 6. Later ideas

- **F-50 Profit and loss:** needs item-level costs or periodic stock counts. Sales minus purchases is only cash flow.
- **F-51 Stock:** items, quantities, reorder hints.
- **F-52 Fonepay statement import:** CSV or PDF export from the merchant portal, replacing manual QR totals.
- **F-53 Multi-shop and productisation:** already possible in the data model through `shopId`.

---

## 7. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-01 | Capture speed | Named bill with amount ≤ 15 s median; ≤ 6 taps plus digits |
| NFR-02 | Zero data loss | Photo and metadata written to IndexedDB before "saved" is shown; survives app kill, reboot and offline |
| NFR-03 | Performance on Redmi 15C | Today interactive < 2 s on a warm start; list scrolling smooth at 1,000 bills; initial JS for Buwa's routes ≤ 250 KB gzipped |
| NFR-04 | Offline | Capture, name picking and name creation work offline once the app has loaded; automatic sync on reconnect |
| NFR-05 | Legibility | Body text ≥ 18 px; primary actions ≥ 64 px tall; all targets ≥ 48 px; WCAG AA contrast; colour never the only signal |
| NFR-06 | Security | Invite-only; membership checked server-side in every function; `shopId` never taken from the client; photo URLs are unguessable but not access-controlled in v1 (accepted risk, see architecture §9) |
| NFR-07 | Retention | Bills and photos kept ≥ 6 years; no hard delete from the app |
| NFR-08 | Cost | ≤ USD 10/month for one shop in v1 (expected: close to 0) |
| NFR-09 | Time | All "today" logic in NPT (UTC+05:45); BS for display and grouping |
| NFR-10 | Recoverability | Monthly CSV and Convex snapshot backups; summaries and balances can be rebuilt from transactions |

## 8. Open questions

To be resolved during the v1 trial. Record answers in `decisions.md`.

1. Should an amount become required in v1, or stay optional? Decide from the trial rate of "No amount" bills.
2. Day close inputs: total sales, or cash counted plus QR? (F-23)
3. Does Aama want her own account (`staff`), or will Buwa enter everything?
4. The shop's real name and a logo for the app icon and the future statement header.
5. Custom domain, or the `*.vercel.app` URL?
