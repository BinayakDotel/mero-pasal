# Mero Pasal — UI / UX Context

> The visual and interaction rules for every screen. The clickable references are `docs/mockups/father-app.html` (Buwa's phone app) and `docs/mockups/admin-console.html` (Binayak).
> **If a screen you're building isn't described here, stop and ask; don't invent a new pattern.**

## 1. Who we design for

**Buwa:**
- a shopkeeper who writes bills by hand, photographs them, and uses the phone calculator
- reads Nepali and English
- is standing at a busy counter, often with one hand free, sometimes in poor light

Every screen is judged by one question: *can he do this between two customers without thinking?*

**Binayak (admin):**
- a software engineer on a laptop in the evening
- wants density and speed, with keyboard-friendly tables

## 2. Interaction principles (Buwa's app)

1. **One decision per screen.** Type → photo → name → amount → save. Never two questions at once.
2. **The primary action is the biggest thing on screen** and sits in the thumb zone (bottom 40%).
3. **Nothing blocks saving.** Every step except the photo has a visible skip: "पछि / Later" or "रकम पछि हाल्छु". Missing data goes to Binayak's review queue.
4. **Show the photo while asking about it.** On the name and amount steps, the bill thumbnail stays visible so he can read the total off it.
5. **Confirm with the thing itself.** After saving, show *his bill* stamped "राखियो", not a generic toast.
6. **Undo beats "Are you sure?"** Use a confirm sheet only for Remove. Everything else is undoable or editable.
7. **Say where it went.** Sync status is always visible, in words, never only an icon.
8. **Same word, same action, everywhere.** "राख्नुहोस्" (Save) produces "राखियो" (Saved). "हटाउनुहोस्" (Remove) produces "हटाइयो" (Removed).
9. **Colour is never alone.** Type is shown by colour *and* icon *and* label.
10. **No jargon.** "बेचेको / किनेको", not "आउटवार्ड / इनवार्ड". "खाता", not "पार्टी". "पठाउन बाँकी", not "सिंक पेन्डिङ".

## 3. Visual language

The look comes from the shop's own materials:
- ruled ledger paper
- blue carbon-copy ink on printed invoices
- the red cloth of a traditional *bahi-khata*
- marigold (सयपत्री) for the credit that has to come back

### 3.1 Colour tokens

Defined once in `packages/ui/src/styles/theme.css` with Tailwind v4 `@theme`. **No raw hex in components.**

| Token | Hex | Use |
|---|---|---|
| `--color-paper` | `#F2F4F1` | App background: cool ledger paper |
| `--color-card` | `#FFFFFF` | Raised surfaces, sheets |
| `--color-ink` | `#1B2433` | Primary text (blue-black ink) |
| `--color-ink-soft` | `#566074` | Secondary text (≥ 4.5:1 on paper) |
| `--color-rule` | `#C7D3E3` | Ledger ruling, dividers |
| `--color-sale` | `#1E7A4C` | Sold / money in (with its `-tint` `#E3F1E9`) |
| `--color-buy` | `#2C3D9A` | Bought / supplier (with its `-tint` `#E4E8F7`) |
| `--color-udharo` | `#D98E0B` | Credit, "needs attention" (with its `-tint` `#FBEFD6`); text on it uses ink |
| `--color-bahi` | `#9E2A2B` | Brand mark, ledger margin line, destructive actions |
| `--color-ok` | `#1E7A4C` | "All saved" (same as sale, always paired with ✓ and text) |

Dark mode: not in v1. The shop is bright and paper-like surfaces photograph and read better.

### 3.2 Typography

| Role | Family | Size / weight | Notes |
|---|---|---|---|
| Amounts, screen titles, big buttons | **Baloo 2** | 28–44 px / 700–800 | Echoes painted Devanagari shop signs; carries both scripts |
| Body, lists, inputs | **Mukta** | 18–20 px / 400–600 | The standard Nepali web face; excellent Devanagari |
| Small meta (time, tag) | Mukta | 15–16 px / 500 | Never below 15 px in Buwa's app |

Fallback stack: `"Noto Sans Devanagari", system-ui, sans-serif`. Load through `next/font/google` with the `devanagari` and `latin` subsets.

Digits:
- Amounts use **Latin digits** with lakh grouping: `रु 1,23,456` in Nepali, `Rs 1,23,456` in English.
- Dates in Nepali mode use Devanagari digits: `७ असोज`.
- Use `font-variant-numeric: tabular-nums` in columns.

### 3.3 Space, shape, depth

- Spacing scale: 4 · 8 · 12 · 16 · 24 · 32 · 48. Screen padding 16 px.
- Tap targets:
  - primary buttons ≥ 64 px tall
  - list rows ≥ 64 px
  - chips and icons ≥ 48 px
- Radius by hierarchy, not one value everywhere:
  - giant action buttons 20 px
  - sheets 24 px (top corners)
  - chips are full pill
  - list rows 0; they sit on ruled lines like a ledger
- Depth: sheets and the bottom nav get one soft shadow. Lists are flat.

### 3.4 Signature details

- **Ledger strip.** Money summaries (Today's totals, account totals) sit on ruled lines with a thin red `bahi` margin line on the left. Amounts are right-aligned like a ledger column.
- **The stamp.** On save, a rubber-stamp mark "राखियो ✓" lands on the bill thumbnail: it scales from 1.4 to 1 and settles at −8°, about 350 ms. **This is the only non-essential animation in the app.** With `prefers-reduced-motion`, it simply appears.
- **Type edge.** Every bill row has a 6 px left edge in the sale or buy colour.

### 3.5 The paper feel is intentional — keep it (ADR-022)

Buwa has spent decades with bill books and a khata register. Mero Pasal should feel like *his paper, organised*, not like a shiny new app he has to learn. Binayak has confirmed this direction. AI agents must not "modernise" it away.

| Keep | Why |
|---|---|
| Ledger-paper background with a faint grain (`--grain`, ≤ 9% alpha noise) | Feels like paper and keeps contrast at WCAG AA. Never use gradients or glossy surfaces. |
| **Ruled lines** under money rows and lists | Every list of money reads like a ledger page |
| The **red margin line** (`--color-bahi`, ~40% opacity) on name lists and ledger strips | The khata register he already uses: initial in the margin, name on the line |
| A **double rule** under the amount being entered | The accountant's "total" line on a paper bill |
| Carbon-blue for suppliers and leaf-green for sales | The colours of printed invoices and money coming in |
| The rubber-stamp "राखियो" on save | The one moment of motion, and it's a physical metaphor |

**Don't:**
- card grids with drop shadows
- glassmorphism, gradients or neon accents
- dark mode for Buwa's app

The camera and full-size photo views are the only dark surfaces, because photos read better on dark.

## 4. Navigation model

```text
┌───────────────────────────────┐
│ Header: date · sync pill · ने/EN│
│                               │
│   screen content              │
│                               │
├──────────┬──────────┬─────────┤
│  आज      │  बिलहरू   │  खाता    │   ← bottom nav, 3 items, icon + label
└──────────┴──────────┴─────────┘
```

- The capture flow is **full-screen**, with no bottom nav. It has a back arrow and a step indicator (e.g. `२/४`).
- Sheets (new name, date picker, confirm remove, sync details) slide up from the bottom and close with a swipe down or a tap outside.
- Settings open from a gear icon in the Today header. Language is also switchable there directly.

## 5. Screen specs (Buwa's app)

### 5.1 Today (F-02)

1. **Header:**
   - weekday and BS date, large ("बुधबार, ७ असोज")
   - shop name, small
   - sync pill
   - language switch
2. **Two giant buttons**, stacked, each ~120 px tall and full width:
   - **बेचेको बिल / Sold bill**: sale colour, icon of a bag going out, sub-label "ग्राहकलाई बेचेको"
   - **किनेको बिल / Bought bill**: buy colour, icon of a box coming in, sub-label "सप्लायरबाट किनेको"
3. **Ledger strip "आजका बिल":**
   - बेचेको: amount right-aligned, count
   - किनेको: amount, count
   - a "रकम नहालेका" line (marigold) only when the count is > 0
4. **Recent bills today:** up to 5 rows, then "सबै हेर्नुहोस्" (see all).
5. v1.1: a "दिनको हिसाब" button under the strip; an "उधारो दिएको" line in the strip.

**Unfinished bill card (F-03, M2)** sits under the sync pill when a draft exists: its thumbnail, **अधुरो बिल छ**, and **जारी राख्नुहोस्** / **हटाउनुहोस्**. Removing asks first, because it deletes the photos.

**Offline (M2):** bills still on the phone appear in the strip and in the recent list with a clock. Headings show **(पुरानो)** while the numbers are the last saved copy.

Empty state: "आज कुनै बिल छैन। माथिको बटन थिचेर पहिलो बिल राख्नुहोस्।" (No bills today. Press a button above to save the first bill.)

### 5.2 Capture: photo and preview (F-03)

- Capture uses the native camera, so there is no custom UI for taking the photo.
- **Preview:**
  - the photo fills the width
  - page count chip ("पाना १")
  - bottom actions: **ठीक छ** (primary, full width), then **फेरि खिच्नुहोस्** and **अर्को पाना** as secondary buttons side by side

### 5.3 Capture: whose bill? (F-04)

- **Top bar:** back, the title "कसको बिल?", the type badge, and the bill thumbnail (small, top right).
- **Search input**, 56 px tall, with placeholder "नाम खोज्नुहोस् (नेपाली वा English)". v1.1 adds a mic button at its right end.
- **Sale bills only:** a big **नगद ग्राहक** row with a person-with-coin icon.
- **"हालैका" (recent) list:** each row shows the avatar initial, the name, the tag, and the last bill. As he types, it becomes "खोजेका" (results).
- **Sticky bottom:** **+ नयाँ नाम थप्नुहोस्** (secondary) and a small "पछि" (Later) link.
- **New-name sheet:**
  - name (autofocus, prefilled)
  - phone
  - tag (placeholder "जस्तै: चोक, ड्राइभर, पसल छेउ")
  - **नाम राख्नुहोस्**
- **Duplicate prompt** appears inside the sheet, not as a separate dialog: "यस्तै नाम पहिले नै छ" with a card for the existing account and the buttons **हो, उही हो** / **होइन, नयाँ बनाउनुहोस्**.
- **Nothing found:** don't show an empty list. Show a card with the searched text in bold and one full-width primary button, **+ “X” नाम थप्नुहोस्**, in the bill type's colour. Near matches go underneath under "यीमध्ये कोही हो?". When results do exist, end the list with a dashed **“X” अर्कै मान्छे हो? नयाँ थप्नुहोस्** row.
- **Voice (F-24):**
  1. The mic (56 px, ink) sits right of the search box.
  2. Listening is a full-screen paper view: a pulsing red mic (static if reduced motion), "सुन्दैछ… नाम भन्नुहोस्", the live transcript on a ruled line, and **रद्द गर्नुहोस्**.
  3. After listening, a dashed "सुनियो “…”" strip with **फेरि भन्नुहोस्** stays above the results.
  4. Add from voice opens the sheet titled **नाम ठीक छ?** without auto-focusing the keyboard.
  5. Offline: the mic is disabled with the hint "इन्टरनेट चाहिन्छ".

### 5.4 Capture: amount (F-03, F-05)

- **Top:** the account name and type badge, with the bill thumbnail (tap to enlarge, so he can read the total).
- **Display:** "जम्मा कति?", then the amount in 44 px Baloo 2 ("रु 2,340"). The placeholder is "रु 0" in soft ink.
- **Number pad:** 3×4 grid with 72 px keys: `1–9`, `00`, `0`, `⌫`. Long-press `⌫` clears all.
- **Date chip:** "मिति: आज ▾" opens the date sheet (आज / हिजो / अस्ति / अरू मिति).
- v1.1 payment chips go under the display: नगद · QR · उधारो · केही उधारो for sales, and तिरेँ · बाँकी · केही बाँकी for purchases.
- **Bottom:**
  - **बिल राख्नुहोस्**, full width, 64 px, in the type colour
  - above it, the small text link "रकम पछि हाल्छु"

### 5.5 Bills list (F-06)

- Filter chips: सबै · बेचेको · किनेको · रकम छैन. Search icon in the header.
- Date group headers are sticky: "आज · ७ असोज", "हिजो · ६ असोज", "मङ्गलबार · ५ असोज".
- Each row shows:
  - the type edge
  - a 48 px thumbnail
  - the name, with the time underneath
  - the amount, right-aligned (or a "रकम छैन" marigold tag)
  - a pending icon when relevant

### 5.6 Accounts (F-07)

- **List:** tabs ग्राहक / सप्लायर, search, rows with avatar, name and tag, and this month's total on the right.
- **Account page:**
  - header with name, tag, and a call button if a phone number exists
  - ledger strip: यो महिना (this month) and जम्मा (all time)
  - v1.1 balance card: "बाँकी रु 12,300" in marigold, with **पैसा आयो**
  - bill list below

### 5.7 Bill detail (F-08)

- Full-width photo; double-tap zoom and pinch; page dots.
- Fields are listed as ruled ledger lines: प्रकार, नाम, रकम, मिति, राख्ने (captured by), समय.
- Actions at the bottom: **सच्याउनुहोस्** (secondary), and **हटाउनुहोस्** as a bahi-red text button.

## 6. Admin console (Binayak)

- Desktop-first, min width 1024. English UI, with data shown as entered (Nepali names stay in Devanagari).
- Left sidebar: Overview · Bills · Accounts · Members · Export. From v1.2 also Ledger · Reports.
- The same tokens, denser:
  - 14–15 px Mukta body
  - 40 px table rows
  - tabular numbers
- Bill drawer on the right (560 px): photo with zoom, editable fields (type, account, amount, date, bill number, note), remove / restore, audit history. It edits the version it opened: if the bill changes meanwhile (Buwa's correction), it says so and the server refuses the save.
- Accounts: a table with search in either script (and tag, phone); a row opens an edit dialog (name, kind, tag, phone, PAN, archive, merge into…). A merge in progress shows "Merging into X…" with Resume / Stop.
- Admin changes are online-only (ADR-034): no outbox; buttons are disabled offline.
- **Needs attention** is the Overview's main block. Each item can be fixed inline without leaving the page.
- Keyboard: `j`/`k` move between rows, `Enter` opens the drawer, `Esc` closes it, `/` jumps to search.

## 7. States every screen must handle

| State | Buwa's app | Admin |
|---|---|---|
| Loading | Skeleton rows on ruled lines (no spinners over 300 ms) | Skeleton table |
| Empty | One sentence of direction plus the relevant action | Same |
| Offline | Sync pill in marigold; data from cache; "(पुरानो)" hint on stale lists | Banner "Offline — changes can't be saved now."; save buttons disabled |
| Error | A plain sentence naming what happened and what to do, e.g. "फोटो पठाउन सकिएन। इन्टरनेट आएपछि आफैँ पठाइन्छ।" (The photo couldn't upload. It will send by itself when the internet returns.) | Code and message in a toast; details in the console |
| Not invited | "तपाईंलाई यो पसलमा थपिएको छैन। बिनायकलाई सम्पर्क गर्नुहोस्।" (You haven't been added to this shop. Contact Binayak.) | Same |

## 8. Copy deck

Keys map to `packages/shared/src/i18n/{ne,en}.ts`. Nepali is the default.

| Key | ne | en |
|---|---|---|
| `nav.today` | आज | Today |
| `nav.bills` | बिलहरू | Bills |
| `nav.accounts` | खाता | Accounts |
| `action.sale` | बेचेको बिल | Sold bill |
| `action.sale.sub` | ग्राहकलाई बेचेको | Sold to a customer |
| `action.purchase` | किनेको बिल | Bought bill |
| `action.purchase.sub` | सप्लायरबाट किनेको | Bought from a supplier |
| `today.billed` | आजका बिल | Today's bills |
| `today.noAmount` | रकम नहालेका | Without amount |
| `common.back` | पछाडि | Back |
| `capture.page` | पाना {n} | Page {n} |
| `capture.photoAlt` | बिलको फोटो, पाना {n} | Bill photo, page {n} |
| `capture.hint` | बिल पूरै देखिने गरी खिच्नुहोस् | Fit the whole bill in the frame |
| `capture.maxPages` | बढीमा {n} पाना | Up to {n} pages |
| `capture.unreadable` | यो फोटो खोल्न सकिएन। फेरि खिच्नुहोस्। | This photo couldn't be opened. Please take it again. |
| `capture.leave` | बिल नराखी फर्कने? | Leave without saving? |
| `capture.leaveSub` | खिचेको फोटो हट्छ। | The photo you took will be discarded. |
| `capture.leaveYes` | हो, फर्कने | Yes, leave |
| `capture.leaveNo` | होइन, बस्ने | No, stay |
| `draft.title` | अधुरो बिल छ | Unfinished bill |
| `draft.sub` | जारी राख्ने कि हटाउने? | Continue it or remove it? |
| `draft.continue` | जारी राख्नुहोस् | Continue |
| `draft.discard` | हटाउनुहोस् | Remove |
| `draft.discardConfirm` | यो अधुरो बिल हटाउने? यसको फोटो पनि हट्छ। | Remove this unfinished bill? Its photos go too. |
| `draft.keep` | होइन, राख्ने | No, keep it |
| `photo.use` | ठीक छ | Use photo |
| `photo.retake` | फेरि खिच्नुहोस् | Retake |
| `photo.addPage` | अर्को पाना | Add page |
| `party.title` | कसको बिल? | Whose bill? |
| `party.search` | नाम खोज्नुहोस् (नेपाली वा English) | Search name (Nepali or English) |
| `party.walkIn` | नगद ग्राहक | Walk-in customer |
| `party.recent` | हालैका | Recent |
| `party.add` | नयाँ नाम थप्नुहोस् | Add new name |
| `party.later` | पछि | Later |
| `party.save` | नाम राख्नुहोस् | Save name |
| `party.similar` | यस्तै नाम पहिले नै छ | A similar name already exists |
| `party.same` | हो, उही हो | Yes, same person |
| `party.new` | होइन, नयाँ बनाउनुहोस् | No, create new |
| `party.notFound` | “{q}” नाम अहिलेसम्म छैन | No name “{q}” yet |
| `party.addThis` | “{q}” नाम थप्नुहोस् | Add “{q}” as a new name |
| `party.notThem` | “{q}” अर्कै मान्छे हो? नयाँ थप्नुहोस् | A different “{q}”? Add as new |
| `party.isItThis` | यीमध्ये कोही हो? | Is it one of these? |
| `party.results` | खोजेका | Results |
| `party.walkInSub` | नाम नचाहिने बिक्री | Sale without a name |
| `party.newTitle` | नयाँ नाम | New name |
| `party.fieldName` | नाम | Name |
| `party.nameHint` | एउटै नाम धेरै भए नाममै एउटा शब्द थप्नुहोस्, जस्तै “राम स्कूल” | Same name as someone else? Add a word to the name, like “Ram school” |
| `party.fieldPhone` | फोन (नभए खाली) | Phone (optional) |
| `party.fieldTag` | चिनाउने शब्द (नभए खाली) | Tag to tell apart (optional) |
| `party.fieldTagHint` | जस्तै: चोक, ड्राइभर, पसल छेउ | e.g. Chowk, driver, next to shop |
| `party.confirmName` | नाम ठीक छ? | Is the name right? |
| `party.confirmSub` | सुनेको नाम हो। मिलेन भने सच्याएर राख्नुहोस्। | This is what I heard. Fix it if it's wrong, then save. |
| `voice.listening` | सुन्दैछ… नाम भन्नुहोस् | Listening… say the name |
| `voice.heard` | सुनियो | Heard |
| `voice.sayAgain` | फेरि भन्नुहोस् | Say again |
| `voice.needsInternet` | इन्टरनेट चाहिन्छ | Needs internet |
| `common.cancel` | रद्द गर्नुहोस् | Cancel |
| `amount.title` | जम्मा कति? | Bill total? |
| `amount.later` | रकम पछि हाल्छु | Add amount later |
| `amount.delete` | मेटाउनुहोस् | Delete |
| `amount.confirmLarge` | {amount} — ठीक हो? | {amount} — is this right? |
| `amount.confirmYes` | हो, ठीक छ | Yes, it's right |
| `amount.confirmNo` | सच्याउँछु | Let me fix it |
| `capture.saving` | राख्दै… | Saving… |
| `capture.storageFull` | फोनमा ठाउँ भएन। केही फोटो वा एप मेटाएर फेरि राख्नुहोस्। | The phone is out of space. Delete some photos or apps, then save again. |
| `capture.saveFailed` | बिल राख्न सकिएन। फेरि प्रयास गर्नुहोस्। | Couldn't save the bill. Please try again. |
| `date.label` | मिति | Date |
| `date.prevMonth` | अघिल्लो महिना | Previous month |
| `date.nextMonth` | अर्को महिना | Next month |
| `party.noName` | नाम छैन | No name |
| `photo.enlarge` | फोटो ठूलो गर्नुहोस् | Enlarge photo |
| `common.close` | बन्द गर्नुहोस् | Close |
| `date.today` / `date.yesterday` / `date.dayBefore` / `date.pick` | आज / हिजो / अस्ति / अरू मिति | Today / Yesterday / Day before / Pick date |
| `bill.save` | बिल राख्नुहोस् | Save bill |
| `bill.saved` | राखियो | Saved |
| `bill.correct` | सच्याउनुहोस् | Correct |
| `bill.remove` | हटाउनुहोस् | Remove |
| `bill.removeConfirm` | यो बिल हटाउने? | Remove this bill? |
| `bill.removed` | हटाइयो | Removed |
| `common.undo` | फर्काउनुहोस् | Undo |
| `bill.noAmount` | रकम छैन | No amount |
| `bills.empty` | यहाँ कुनै बिल छैन। | No bills here. |
| `bills.searchEmpty` | “{q}” नामको बिल भेटिएन | No bills for “{q}” |
| `accounts.customers` | ग्राहक | Customers |
| `accounts.suppliers` | सप्लायर | Suppliers |
| `accounts.empty` | अहिलेसम्म कुनै खाता छैन। | No accounts yet. |
| `account.thisMonth` | यो महिना | This month |
| `account.allTime` | जम्मा | All time |
| `account.call` | फोन गर्नुहोस् | Call |
| `account.allMonths` | सबै महिना | All months |
| `account.details` | विवरण | Details |
| `account.otherScript` | अर्को लिपिमा | Other script |
| `account.phone` | फोन | Phone |
| `account.tag` | चिनाउने शब्द | Tag |
| `account.kind` | प्रकार | Kind |
| `account.kindCustomer` | ग्राहक | Customer |
| `account.kindSupplier` | सप्लायर | Supplier |
| `account.kindBoth` | ग्राहक र सप्लायर दुवै | Customer and supplier |
| `account.firstBill` | पहिलो बिल | First bill |
| `account.lastBill` | पछिल्लो बिल | Last bill |
| `account.thisMonthSold` | यो महिना बेचेको | Sold this month |
| `account.thisMonthBought` | यो महिना किनेको | Bought this month |
| `account.allTimeSold` | जम्मा बेचेको | Sold in all |
| `account.allTimeBought` | जम्मा किनेको | Bought in all |
| `account.edit` | सच्याउनुहोस् | Edit |
| `account.editTitle` | खाता सच्याउनुहोस् | Edit account |
| `account.editSave` | राख्नुहोस् | Save |
| `account.edited` | सच्याइयो | Saved |
| `account.needsInternet` | सच्याउन इन्टरनेट चाहिन्छ। इन्टरनेट आएपछि फेरि खोल्नुहोस्। | Editing needs the internet. Open this again once you're online. |
| `account.similarKeep` | होइन, यही नाम राख्ने | No, keep this name |
| `account.similarHint` | एउटै मान्छे भए बिनायकलाई दुई खाता मिलाउन भन्नुहोस्। | If it's the same person, ask Binayak to merge the two accounts. |
| `field.type` | प्रकार | Type |
| `field.name` | नाम | Name |
| `field.amount` | रकम | Amount |
| `field.capturedBy` | राख्ने | Saved by |
| `field.time` | समय | Time |
| `field.pages` | पाना | Pages |
| `field.billNumber` | बिल नम्बर | Bill number |
| `bill.removeSub` | हटाएको बिल हिसाबमा गनिँदैन। बिनायकले फर्काउन सक्छन्। | A removed bill isn't counted. Binayak can restore it. |
| `bill.correctTitle` | बिल सच्याउनुहोस् | Correct bill |
| `bill.corrected` | सच्याइयो | Corrected |
| `bill.editWindow` | २४ घण्टापछि यो बिल सच्याउन वा हटाउन मिल्दैन। | This bill can't be changed after 24 hours. |
| `sync.ok` | सबै सुरक्षित | All saved |
| `sync.pending` | {n} पठाउन बाँकी | {n} waiting to upload |
| `sync.offline` | इन्टरनेट छैन — बिल फोनमा सुरक्षित छन् | No internet — bills are safe on this phone |
| `sync.failed` | पठाउन सकिएन | Couldn't upload |
| `pay.cash` / `pay.qr` / `pay.udharo` / `pay.partUdharo` (v1.1) | नगद / QR / उधारो / केही उधारो | Cash / QR / Udharo / Part udharo |
| `pay.paid` / `pay.due` / `pay.partDue` (v1.1) | तिरेँ / बाँकी / केही बाँकी | Paid / Due / Part due |
| `account.balance` (v1.1) | बाँकी | Balance due |
| `account.received` (v1.1) | पैसा आयो | Money received |
| `dayClose.title` (v1.1) | दिनको हिसाब | Day close |
| `app.name` | मेरो पसल | Mero Pasal |
| `kind.sale` | बेचेको | Sold |
| `kind.purchase` | किनेको | Bought |
| `filter.all` | सबै | All |
| `today.billCount` | {n} बिल | {n} bill(s) |
| `today.recent` | हालै राखेका | Recently saved |
| `today.empty` | आज कुनै बिल छैन। माथिको बटन थिचेर पहिलो बिल राख्नुहोस्। | No bills today. Press a button above to save the first bill. |
| `today.seeAll` | सबै हेर्नुहोस् | See all |
| `sync.statusPending` | पठाउन बाँकी | Waiting to upload |
| `sync.sheetTitle` | पठाउन बाँकी बिलहरू | Waiting to upload |
| `sync.tryNow` | अहिले पठाउनुहोस् | Try now |
| `sync.allSent` | सबै बिल पठाइसकियो। | Everything has been sent. |
| `sync.offlineHint` | इन्टरनेट आएपछि आफैँ पठाइन्छ। बिलहरू फोनमा सुरक्षित छन्। | They'll send by themselves when the internet is back. The bills are safe on this phone. |
| `sync.newName` | नयाँ नाम: {name} | New name: {name} |
| `sync.blocked` | यसको नाम पठाउन सकिएन | Its name couldn't be sent |
| `sync.storageLow` | फोनमा ठाउँ कम छ। पुराना फोटो वा एप मेटाउनुहोस्। | Phone storage is low. Delete old photos or apps. |
| `sync.photoLost` | यो बिलको फोटो फोनमा पढ्न सकिएन। बिल खोलेर हटाउनुहोस्, अनि फेरि खिच्नुहोस्। | This bill's photo can't be read on this phone. Open the bill, remove it, and take it again. |
| `sync.stale` | (पुरानो) | (old) |
| `offline.title` | इन्टरनेट छैन | No internet |
| `offline.body` | इन्टरनेट आएपछि एप फेरि खोल्नुहोस्। | Open the app again when the internet is back. |
| `auth.notInvited` | तपाईंलाई यो पसलमा थपिएको छैन। बिनायकलाई सम्पर्क गर्नुहोस्। | You haven't been added to this shop. Contact Binayak. |
| `auth.signInSub` | Google खाताबाट भित्र पस्नुहोस् | Sign in with your Google account |
| `auth.signOut` | बाहिर निस्कनुहोस् | Sign out |
| `lang.switch` | भाषा बदल्नुहोस् | Change language |
| `lang.ne` | नेपाली | नेपाली |
| `lang.en` | English | English |
| `settings.open` | सेटिङ | Settings |
| `error.UNAUTHENTICATED` | फेरि साइन इन गर्नुहोस्। | Please sign in again. |
| `error.FORBIDDEN` | तपाईंलाई यो काम गर्ने अनुमति छैन। | You're not allowed to do this. |
| `error.NOT_FOUND` | यो भेटिएन। हटाइएको हुन सक्छ। | This wasn't found. It may have been removed. |
| `error.VALIDATION` | केही मिलेन। जाँचेर फेरि प्रयास गर्नुहोस्। | Something doesn't look right. Check and try again. |
| `error.CONFLICT` | यो पहिले नै छ। | This already exists. |
| `error.unknown` | केही गडबड भयो। फेरि प्रयास गर्नुहोस्। | Something went wrong. Try again. |

Tone: plain, polite imperative (-नुहोस्), and short. Messages don't apologise and are never vague.

This table and `packages/shared/src/i18n/{ne,en}.ts` are kept identical by a unit test: change both together. Month and weekday names live in `@mero-pasal/shared/dates`.

## 9. Accessibility and quality floor

- Contrast: WCAG AA for all text. Large amounts meet AA against their tint backgrounds.
- Every icon button has an `aria-label` in the active language, and `lang="ne"` or `lang="en"` is set on `<html>`.
- Focus is visible (a 3 px ink outline) for the admin console and keyboard users.
- Respect `prefers-reduced-motion`: the stamp appears without motion.
- Layout survives 130% system font scaling (Android "large font"). Test on the Redmi with Display → Font size at its largest.
- Photos get `alt` text of the form "{name}को बिल, {date}".

## 10. Do / don't

| Do | Don't |
|---|---|
| Keep capture to one question per screen | Put type, name and amount on one form |
| Put the most-used names first | Make him search for his top 10 customers |
| Show the bill thumbnail while asking about it | Ask for data he can only get from the paper he just put down |
| Use words from the shop counter | Use accounting terms (डेबिट, क्रेडिट, इनवार्ड) |
| Save first, fix later | Validate aggressively before saving |
| Show sync state in words | Show a spinner without explanation |
