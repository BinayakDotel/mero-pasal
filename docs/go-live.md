# Go live for the M5 trial

> For Binayak. Every step here touches production, so **you** run it (golden rule 9: AI agents never do).
> Setup per ADR-035: the Vercel production URL (`*.vercel.app`), the **Clerk development instance** for sign-in, and the **Convex production deployment** for Buwa's real bills. Test data stays in Convex dev.

Tick the steps off as you go. If anything looks different from what's described, stop and note it in the tracker.

## 0. Before you start

- [ ] M4 checks on the Mac passed (tracker → M4).
- [ ] `main` is green: `just check`, and `just e2e` passes 27/27.
- [ ] You have Buwa's phone, charged, on Wi-Fi, with the Google account he'll use.

## 1. Clerk (development instance `direct-drum-2930`)

- [ ] **Sessions → Session lifetime:** maximum lifetime at least **90 days** (365 is fine) and **inactivity timeout off**. The default is 7 days, and F-01 needs no login prompt for 30+ days.
- [ ] **Sessions → Customize session token** still has `{"email": "{{user.primary_email_address}}", "email_verified": "{{user.email_verified}}"}`. Invites need it (ADR-034).
- [ ] **User & authentication:** Google is on. Nothing else is needed.

## 2. Convex production deployment

In the Convex dashboard, switch to the project's **Production** deployment.

- [ ] **Settings → Environment Variables:** set `CLERK_JWT_ISSUER_DOMAIN` to the **same value as on the dev deployment** (the Clerk dev issuer, `https://direct-drum-2930.clerk.accounts.dev`). Copy it from dev rather than retyping it.
- [ ] **Settings → Deploy key → Generate a production deploy key.** Copy it for step 3. Don't save it in any file.

## 3. Vercel project settings

**Environment Variables**, by environment:

| Variable | Production | Preview |
|---|---|---|
| `CONVEX_DEPLOY_KEY` | the production deploy key from step 2 | **not set** (previews must never deploy to production) |
| `NEXT_PUBLIC_CONVEX_URL` | **remove** (the build sets it from the deploy) | the Convex **dev** URL, as today |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dev `pk_test_…` | same |
| `CLERK_SECRET_KEY` | Clerk dev `sk_test_…` | same |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` | same |

- [ ] **Git → Production Branch** is `main`.

## 4. First production deploy

- [ ] Redeploy the latest `main` (Vercel → Deployments → the latest production deployment → **Redeploy**, without the build cache).
- [ ] The build log shows `convex deploy` pushing to the **production** deployment (its `https://<name>.convex.cloud` URL, not the dev one), then the Next build.
- [ ] The Convex production dashboard now shows the tables (all empty) and functions.

## 5. First sign-ins, then seed the shop

1. **Any phone that opened the production URL while testing** (your iPhone, maybe Buwa's): clear the site's data first. In Chrome, go to Settings → Site settings → All sites → the `vercel.app` site → **Clear & reset**. On an iPhone it's Settings → Safari → Advanced → Website Data. Otherwise that phone still holds test bills from Convex dev, and they would sit on it as "another account's" bills.
2. [ ] On the Mac, open the production URL and **sign in with your own Google account**. "Not invited" is expected.
3. [ ] On **Buwa's phone** in **Chrome** (not Mi Browser), open the URL and sign in with **his** Google account. Again "Not invited".
4. [ ] Clerk dashboard → **Users**: copy both user ids (`user_…`) and emails.
5. [ ] Seed, from the repo root on the Mac:
   ```bash
   pnpm --filter @mero-pasal/backend exec convex run --prod seed:bootstrap '{
     "shopName": "<shop, in English>", "shopNameNe": "<पसलको नाम>",
     "owner": { "clerkUserId": "<Buwa user_…>", "displayName": "Buwa", "email": "<buwa@gmail.com>" },
     "admin": { "clerkUserId": "<your user_…>", "displayName": "Binayak", "email": "<you@…>" }
   }'
   ```
   It runs once. A second run says `CONFLICT`, which is expected.
6. [ ] Reload on the Mac and open `/admin`. It should show the shop, with **Members** listing Buwa (owner) and you (admin).

## 6. Buwa's phone

- [ ] Chrome is the default browser.
- [ ] Chrome's battery setting is **No restrictions**. On the Redmi: Settings → Apps → Chrome → Battery saver.
- [ ] Close and reopen the URL. It lands on **Today** in Nepali.
- [ ] Chrome menu → **Install app** / **Add to Home screen**. The icon says "मेरो पसल". From now on, open it from the icon.
- [ ] Mobile data is on as a fallback.
- [ ] **Offline check:**
  1. Turn on airplane mode.
  2. Capture one test bill. The pill should say "इन्टरनेट छैन — बिल फोनमा सुरक्षित छन्".
  3. Close the app, turn airplane mode off, and reopen the app. The pill should reach "सबै सुरक्षित".
  4. Find the bill in `/admin/bills` on the Mac.
  5. **Remove it** there, so the trial starts clean.
- [ ] Storage: the app asks Chrome to keep its data, and Chrome allows it once the app is installed. Nothing to do.

## 7. Training (15 minutes at the counter)

- [ ] Walk through the card (`docs/trial/instruction-card.html`, printed on A4) with 3 real bills:
  1. Photo.
  2. Name, or **पछि** (later).
  3. Amount, or **रकम पछि हाल्छु** (amount later).
  4. **बिल राख्नुहोस्** (save the bill).
- [ ] Show him the pill: "सबै सुरक्षित" means everything is sent. Show him that a bill without internet still saves.
- [ ] Tape the card next to the counter.

## 8. Every day for 14 days

1. **Evening:** get the day's numbers from production.
   ```bash
   pnpm --filter @mero-pasal/backend exec convex run --prod trial:day '{"dateBs":"<today BS, e.g. 2083-06-12>"}'
   ```
   It returns bills, sold/bought counts and totals, how many have no amount or no name, removals, and who took them.
2. Count the paper bills written that day. Add a row to **Trial metrics** in the tracker.
3. Time 3 captures with a stopwatch (from the tap to the saved bill), and write down the median.
4. Fix the day's needs-attention bills in `/admin` (the Overview queue).
5. Write what Buwa said or struggled with in the **Buwa feedback log**.

## 9. Backups

- [ ] **After day 1:** in the Convex production dashboard, go to Settings → **Snapshot export**, download the snapshot, and keep it off the platform.
- [ ] **Monthly (the tracker's recurring task):** export last month's CSV at `/admin/export`, take a snapshot export, and store both off the platform.

## 10. Cleaning up test data

Test bills and accounts made on production during setup can go without touching real ones. All of it is in `/admin` on the Mac, online, and nothing is erased (it can all be brought back).

1. On Buwa's phone, check the pill says "सबै सुरक्षित" (nothing waiting to upload).
2. Back up first: `/admin/export` for the month, and a Convex snapshot (step 9).
3. **A test account:** open it in `/admin/accounts` → **Delete account**. Its bills go with it (ADR-037). From 10 bills on, type its name to confirm.
4. **A test bill on a real account:** open it in `/admin/bills` → **Remove**.
5. **Two accounts for one person:** merge them (Accounts → Edit, archive or merge), don't delete.
6. Check the Overview's month totals and a couple of accounts against the paper book.

If a delete was a mistake: Accounts → tick **Deleted** → open it → **Bring back**. If a bill Buwa saved offline arrives for a deleted account, the account comes back by itself with that bill (its history says so).

## If something goes wrong

- **Web:** Vercel → Deployments → a previous production deployment → **Promote to Production**. This brings the old front end back instantly.
- **Backend:** redeploy an earlier commit of `main`. Its build redeploys that commit's Convex functions. No migration in v1 deletes data, so going back is safe.
- **Buwa can't sign in** or sees "Not invited":
  - In `/admin/members`, check that he is active.
  - In the Clerk dashboard, check his session.
  - The phone keeps its bills either way; they upload once he's signed in again.
- **Totals look wrong:** don't edit rows by hand. Follow the runbook in `packages/backend/convex/rebuild.ts`, run with `--prod`, by you.

## Later: moving to a real domain

This happens when OD-4 is decided (ADR-035):
1. Buy the domain and create a **Clerk production instance** with its own Google OAuth credentials.
2. Set the same session-token claims and session lifetime as in step 1.
3. Point Convex production's `CLERK_JWT_ISSUER_DOMAIN` at the new instance.
4. Put the `pk_live`/`sk_live` keys in Vercel Production.

Everyone gets a new Clerk user id, so the switch needs one small **planned** migration that clears `members.clerkUserId`; each member is then linked again by verified email on their next sign-in (ADR-034). Plan it with an agent first (rule 8).
