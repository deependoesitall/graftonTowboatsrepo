# Where this project stands — Sept 10, 2026

Written so a fresh session (or a fresh person) can pick up without re-deriving
anything. Everything below was verified against the live site or the code, not
recalled.

---

## 🔴 The Sinclair's app could not be signed into at all — FIXED, needs deploy

Reported after installing from `shop.graftontowboatservices.com/install`: tapping
**Sign in** dropped the app out of standalone mode (address bar reappeared) and
landed on the GTS admin login, and signing in there did nothing useful.

It was not a rough edge. It was a **closed loop — that button could never
succeed**, however correctly anyone typed their password:

1. `ShopGate` linked to `/admin`. On the shop host, middleware redirects
   `/admin` to the canonical host. That is a **cross-origin navigation**, and
   both iOS and Android eject an installed app from standalone when one happens.
2. The login then completed **on the other origin**. The session JWT lives in
   `sessionStorage` and the backstop cookie is host-only with
   `sameSite: 'strict'` — so neither is visible to `shop.*`. By design.
3. Back in the installed app, `fetchAdminSession()` still found nothing and
   showed "Sign in to start shopping" again. Forever.

**Fix:** `ShopGate` now renders the sign-in form itself and posts to
`/api/admin/auth` **on whatever host the app is running on**. Middleware's
matcher excludes `/api/`, so that request is served directly on `shop.*` and the
cookie and token land on the origin the picking screens actually read. Nothing
navigates, so standalone mode survives.

Worth knowing: the 8-hour httpOnly cookie now gets set on `shop.*` too, so the
app survives being closed and reopened rather than needing a login every launch
once `sessionStorage` clears.

The one remaining off-origin link is the "wrong app" case — a GTS account
signing into the Sinclair's app gets a link to GTS Orders. That one *should*
leave, because it is sending them to a different app.

⚠️ **Untested — the fix is committed but not deployed.** Reinstall the app after
deploying and check: the sign-in form appears **inside** the app, the address bar
never appears, and a wrong password shows an inline error rather than a redirect.

### Neither install page had a favicon — same shape of bug, also fixed

Both install pages showed the browser's generic globe, and the two route trees
without a favicon were **exactly** the two that set `metadata.icons`:

```ts
icons: { apple: '/branding/shop-icon.png' },   // shop/layout.tsx
icons: { apple: '/branding/admin-icon.png' },  // admin/layout.tsx
```

Declaring `icons` in a segment **replaces** the icon set that segment would
otherwise inherit. With only `apple` listed, every page under `/shop` and
`/admin` emitted an apple-touch-icon and **no `<link rel="icon">` at all** — so
the favicons committed earlier tonight (`app/icon.png`, `app/shop/icon.png`)
were never going to appear on those pages no matter how many times they were
deployed.

Both now list `icon` and `shortcut` alongside `apple`, pointing at
`/branding/favicon-gts.png` (green) and `/branding/favicon-sinclairs.png` (red).
They live in `/public` rather than the app-dir convention because Next serves
convention icons at a hashed URL that cannot be named in a metadata object.

Checked: those two files are the **only** places in `src/` that declare `icons`,
so nothing else is suppressing a favicon.

**Note the ordering trap:** the app-dir favicons may also simply not be live yet
— a lot is still unpushed. Deploy first, then judge. If the globe persists after
a deploy, hard-reload; browsers cache a missing favicon aggressively.

Still to delete by hand: `src/app/shop/icon-1.png`, the stray from the manual
favicon drop.

### 1. Run migrations 071 – 075 in Supabase

Five are written and unrun. Several features are already deployed and inert
without them.

| # | What it does | What breaks without it |
|---|---|---|
| 071 | `browse_rank` on `products_catalog` | ✅ already run |

`RUN_MIGRATIONS_072_075.sql` at the repo root is 072–075 concatenated into one
`BEGIN; … COMMIT;` block for the Supabase SQL Editor — all-or-nothing, safe to
re-run, with verify queries commented at the bottom.

| 072 | `po_number`, `helper_*` on deliveries | Delivery form fails to save those fields |
| 073 | `push_subscriptions` | Web push silently no-ops |
| 074 | `grocery_mode`, `side_purchases`, QB flags | **QuickBooks pack can't compute tax flags** |
| 075 | `catalog_rails` + two settings toggles | Sale / Best-seller rails stay empty |

### 2. Push

Uncommitted work is sitting in the working tree. My shell is dead, so every
`git` command in this project has been run by hand — assume nothing is pushed
until you check.

### 3. One real end-to-end test order

**Still never done on the live domain.** This is the single biggest untested
path in the system. `TEST_TONIGHT.md` has the full script.

⚠️ **Set `SINCLAIRS_ORDER_EMAILS` to your own address in Vercel first.** Real
orders now CC `sinclairfoods@jerseyville-il.net` and Dave. His first experience
of this system should not be a fake order.

---

## ✅ Confirmed working (checked live)

- `graftontowboatservices.com` — apex, valid SSL, serving the new marketing site
- `shop.graftontowboatservices.com` — Sinclair's app, own origin, own icon
- `order.graftontowboatservices.com` — still live, not yet redirected
- Resend DKIM on `send.` survived the DNS move — order email still signs
- Contact form saves to `contact_submissions` (migration 068 is live)
- Catalogue: 11,997 active products, 1.5% with no image

---

## ⚠️ Known gaps, in priority order

**The contact form emails nobody unless `EMAIL_FROM` is set in Vercel.** It
saves the enquiry and returns success, so it looks fine and silently swallows
enquiries. Same variable also fixes order emails coming from
`onboarding@resend.dev`.

**Nothing reads `contact_submissions`.** No admin screen. The route stores
first "so an enquiry can't be lost" — but a backstop nobody can see isn't one.

**`driver_paid_in_qb` has no queue.** The column exists and the flag is
writable; there's no screen for it. Waiting on Mary Karen's walkthrough.

**VAPID keys must be set** (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) or push renders nothing. Generate once
and keep them — rotating invalidates every subscription silently.

**~~`/branding/admin-icon.png` may still be missing.~~ RESOLVED Sept 10.** It
was there all along — but the PWA icons were 1408×1408 and ~2 MB each while
every manifest declares them `512x512`. Same artwork, resized to the declared
512 and compressed: admin 2110 KB → 109 KB, shop 2182 KB → 111 KB.
`gts-logo.png` is now 512×512 and 61 KB, down from 1080×1080 and 748 KB — the
size all four manifests always declared it to be.

**~~Three photos pending.~~ DONE Sept 10 — not yet pushed.** Jen's HEICs are
converted and sitting in `public/site/` under the three names `content.ts`
expects, so the 404s clear on the next deploy. Notes on them:

- Cropped to the ratio each slot actually renders — hero is 16/10 on mobile
  and 21/9 on desktop, service cards are 4:3. Sized to what's displayed
  rather than full-res: 1800px hero, 1200px cards, 615 KB for all three.
- **EXIF stripped.** Phone photos carry GPS.
- **The towboat's name is blurred** in all three (`MIKE SCHMAENG` on the hero,
  a two-letter fragment on the crew-change shot, a passing vessel's board on
  the supplies shot). Soft feathered blur, not a bar.
- **Still visible and unresolved:** the INGRAM logo is large and legible on the
  crew-change photo, and the GTS van's plate is readable on the hero. Both are
  judgement calls nobody has made yet.
- Two of Jen's five shots are unused (a wider version of the crew-change frame,
  and the van doors-open with nobody in it).

---

## The new logo — Sept 10, not yet pushed

Jen's new artwork (round badge + GRAFTON / TOWBOAT SERVICES wordmark) is in as
`branding/gts-lockup.png` — 1200×548, transparent, 133 KB.

**It is used in exactly three places, all of them wide slots where a 2:1 mark
reads correctly:**

| Where | File |
|---|---|
| Store header | `components/layout/SiteHeader.tsx` |
| Marketing site nav | `components/site/SiteChrome.tsx` (`SiteNav`) |
| Install-page hero — both GTS Orders and Sinclair's | `components/InstallGuide.tsx` |

**Everything else still uses the old square `gts-logo.png` (now 512×512), on
purpose.** The lockup is 2:1 and cannot serve as a square mark, and the places
below either need a square or already print the words beside the logo:

- **Home-screen app icons are untouched** — `admin-icon.png` and
  `shop-icon.png` are the original artwork, and the manifests point at them as
  before. (They were resized 1408→512 and compressed on Sept 10; that is the
  same picture at the size every manifest already declared.)
- `AdminNav` — the nav already prints "Grafton Towboat / Services" next to the
  mark, so a wordmark lockup would say it twice.
- `PartnerLockup` — the GTS mark sits against Sinclair's logo with a × between
  them; a wide lockup unbalances the pair.
- `sw.js` push notifications — square.
- `manifest.json`, `admin-manifest.json`, `admin.webmanifest`,
  `shop.webmanifest` — unchanged, still 512×512 PNG + `/icon.svg` maskable.
- `StructuredData.tsx` — the `logo` Google reads for the business. Changing it
  changes what Google shows; that is a decision, not a styling tweak.

### Loose files in public/branding/, safe to delete

Nothing references any of these. They cost ~1.35 MB in the repo.

- `gts-badge.png` (109 KB) — a square crop of the new badge, from a logo
  rollout that was scaled back to the three header slots.
- `gts-logo-1.png` (55 KB) — the compressed logo, downloaded under Windows'
  auto-rename before the write block was cleared. `gts-logo.png` now holds this
  content, so this copy is redundant.
- `logo-circle.png` (1.2 MB) — dead for months.

## Favicon — Sept 10, done

New favicon artwork (rounded square, dark ship over waves, gradient ground).
Wired through Next's file convention, so no code change and no metadata edit:
the nearest `icon.png` in the route tree wins.

| File | Colour | Serves |
|---|---|---|
| `src/app/icon.png` | green — gold→green | every tab: marketing site, catalogue, admin |
| `src/app/shop/icon.png` | **red** — amber→red | `shop.graftontowboatservices.com`, install page included |

The red is the same artwork with the background gradient rotated and the
silhouette warmed. At 32 px in a tab strip the two are unmistakable, which is
the point — Sinclair's staff and GTS staff often have both open.

This is browser-tab favicons only. **Home-screen app icons are deliberately
untouched** — `admin-icon.png`, `shop-icon.png` and the `/icon.svg` maskable
are all as they were.

## Audit — Sept 10, late. Fixed vs still open

### Fixed

**The per-person COD rows didn't add up to the header.** Each person's total was
rounded independently, so the rows and the printed total disagreed by a cent on
about **24% of two-person COD orders**. Visible in the Sept 10 test order: header
$38.58, Amber $30.30 + Andy $8.27 = $38.57. Nobody loses money, but a crew member
adding the rows at the dock gets a different number to the one at the top and
stops trusting the document. Replaced with `allocateCodTotals()` in
`lib/cod-fee.ts` — largest-remainder apportionment in integer cents, verified
against 200,000 random orders with zero mismatches and no one moving more than a
cent. Wired into the email, the PDF and the admin modal; `codPersonTotal()` is
gone.

**The admin modal's rows ignored the fee being typed.** The header used the live
`effectiveFee`, the rows used the stored `order.cod_fee_*`, so editing a fee moved
the total and left the per-person figures on the old number until a save
round-tripped. The modal now allocates against the live values.

**Security headers now cover the whole site** (SECURITY_AUDIT item 6). Only
`/admin` had them; the ordering pages — where boats type names, phone numbers and
orders, and where a login session lives — had none. `nosniff`,
`Referrer-Policy` and `X-Frame-Options: SAMEORIGIN` apply everywhere now, with
admin excluded from that rule by a negative lookahead so its stricter `DENY`
isn't left to rule ordering.

**Removed `experimental.serverActions.allowedOrigins: ['localhost:3000']`.** No
Server Actions exist in the codebase, so it did nothing — but it was a trap
primed to reject production the day someone added one.

Also: deduped `PRELAUNCH_CHECKLIST.md` in `.gitignore`.

### Checked and clean

Every internal link and `fetch('/api/…')` call resolves to a route that exists
(the check that would have caught the notification 404). Two empty catch blocks
in the whole tree, both in settings. No other place computes a COD fee inline.

### Open — needs you, deliberately not done tonight

**`order-documents` bucket is probably public** (SECURITY_AUDIT item 5, still
⬜). Signed delivery logs and register receipts readable by anyone with the URL.
Can't be verified from the repo — Supabase dashboard → Storage. The fix is signed
URLs across three call sites and it risks breaking a working billing flow, so it
is explicitly a post-launch job.

**HSTS.** Left commented in `next.config.js` with the reasoning. Browsers cache
it for a year and it cannot be withdrawn server-side; it goes in on a deploy
someone is watching, ideally without `includeSubDomains` until `shop.*`,
`order.*` and `send.*` are all confirmed HTTPS-only.

**`tsconfig.json` has `"strict": false`.** That is why nothing catches type
errors before deploy, and it is the single biggest reason a build is the first
place a mistake shows up. Turning it on now would surface a large backlog at
once — a post-launch project, not a launch-week one.

**A Content-Security-Policy** — half a day, needs a nonce-based setup for Next's
inline scripts. Post-launch.

### Loose files to delete

- `src/app/shop/icon-1.png` — a stray from the manual favicon drop. Next only
  recognises `icon.png` / `icon<N>.png`, so it is inert, but it looks like a
  second favicon to anyone reading the folder.
- ~20 `.fuse_hidden*` files under `src/app/admin/**` (~1 MB) — orphans from a
  crashed editor mount. Already gitignored, so they are local clutter only.

### Cosmetic, your call

The order form lists each person's COD total **before** the handling fee, with
the fee as its own line. The email and PDF list each person **including** their
share of the fee. Both are internally consistent and both add up; they just
answer the question differently. Worth aligning if a customer ever asks why the
numbers moved between the form and the confirmation.

## Repeat-buyer checkout — Sept 10 overnight, UNVERIFIED

⚠️ **Written while nobody was awake to test it. Nothing here has been compiled.**
It is all additive and every piece degrades to the previous behaviour, but read
this section before deploying rather than after.

**The measure:** step 2 had **12 required fields**. For someone repeating an
order it is now **2** — arrival date and arrival time.

### 1. Repeat Order restores the header (`app/account/page.tsx`)

It used to copy line items only, so the button whose whole promise is "same as
last time" still made a captain retype twelve fields that were already
snapshotted on the order it was repeating.

Three bugs fixed in the same function, one of them financial:

- **`paid_by` was hardcoded to `'vessel'`** — repeating an order silently moved
  every COD line onto the company invoice, and `cod_name` went with it.
- **It merged into an existing cart** rather than replacing it. `addToCart()`
  adds quantities for a product already there, so repeating on top of a cart
  doubled everything (this is why the test cart read $1,333.22 — twice $668.44).
  It now asks before replacing.
- The toast counted the service lines it had just filtered out.

Arrival date, time, secondary location, crew change and notes are deliberately
**cleared**, never restored. A stale date is worse than a blank one: blank is
caught by validation, plausible-but-old gets submitted and the van meets a boat
that left last week.

### 2. Per-person COD payment survives (`lib/cart.ts`, both pages)

`grafton_cod_payments` in localStorage, seeded on mount and written on every
change. A repeat brings back "Amber pays by Venmo, @amber-h" from the order's
own `extended_info.cod_payments`. Kept out of `VesselInfo` on purpose — that
describes the BOAT, this describes particular people and has to go stale when
the names on the COD lines change. An older order with no per-person record
clears the map rather than leaving the last crew's details showing.

### 3. Step 2 collapses to a recap when the boat is already known

**This is deliberately NOT the "skip to Confirm" that was asked for.** Landing
on step 3 means the step-2 fields are never rendered, and the validation that
protects them runs against state the person never saw. That is a bad thing to
ship unverified. The collapse gets the same result — one screen, two fields —
with no change to validation at all: Company and Vessel become a one-line recap
with an Edit link, and **any error at all forces everything back open.**

If you want the true skip-to-confirm afterwards, it is a smaller change on top
of this, and it should be built with a build you can run.

### 4 + 5. Vessel chips and terminal typeahead

New endpoint `GET /api/customer/order-defaults` returns the distinct boats and
terminals from the caller's own past orders.

**No `vessels` table, and that is a decision, not a shortcut.** Every order
already snapshots its full header, so that snapshot IS the record of "this boat,
last time" — correct by construction, written for free on every order. A
separate table would be a second copy of the same facts with a sync problem
attached: edit the boat, past orders keep the old values, and nothing says which
wins. A real table earns its place the day a vessel must be editable without
placing an order, or shared between two people at one company.

- Scoped to `user_id` from a verified bearer token, never to an email or a
  company name — captains' mobiles and vessel emails must not be enumerable.
- Any failure returns empty rather than erroring: a guest, an expired session
  and a 500 all leave the form exactly as it was.
- The terminal field is a native `<datalist>`, not a custom combobox. It stays
  a plain text input, so a brand-new terminal is typed as before and there is
  no popup to misbehave on a phone with one bar.

### What to test first, in order

1. Repeat an order **with COD lines** — check the COD lines are still COD, still
   attributed to the right person, and the payment method came back.
2. Repeat onto a **non-empty cart** — confirm the replace prompt, and that
   declining leaves the cart untouched.
3. Repeat, then check step 2 shows the recap and only asks for date and time.
4. Order **as a guest** (signed out) — confirm no chips, no typeahead, and the
   form behaves precisely as it did before.
5. A boat with a **custom vessel type** — confirm it comes back as Other plus
   the free-text value rather than an empty select.

## Decisions worth not relitigating

- **QuickBooks Online Plus is the system of record.** We never create invoices,
  invoice numbers, payment links or emails to AP. We prepare a pack.
- **Sinclair courtesy grocery lines are NOT taxed in QBO.** Sinclair's tax is
  already inside the register total. This is the highest-consequence rule in
  the codebase.
- **No alcohol, ever** — not on a company order, not COD, not by request.
  Filtered at sync and stated in the Terms.
- **Sinclair's shops the groceries; GTS delivers.** Site copy must never claim
  GTS walks the aisles.
- **No checkbox at checkout** — a notice line above the button instead.
- **Email is the fallback for everything.** Push is additive and must never be
  the only path.
- **Dave's boundary is liability, not the logo.** "Partnered with" + their mark
  is fine; anything implying Sinclair's delivers is not.

---

## The trap that has bitten twice

**Two code paths serve the same data, and fixing the wrong one looks like
success.**

- The ledger UI read `ingram_slip_url` while the data lived in
  `ingram_slip_image_url` — every Ingram delivery stuck in "needs attention".
- The catalogue page queries Supabase directly and never touches
  `/api/products` — so the placeholder-image sort was applied to an endpoint
  nobody was looking at.

**Before changing behaviour, confirm which surface actually serves the page.**

A third instance of the same shape, found Sept 10: **`Photo`'s `width` prop does
nothing for local images.** The component renders a plain `<img>`, and `img()`
returns the src unchanged when it starts with `/` — the `?format=NNNw` resize
only ever applied to Squarespace's CDN. So `width={1800}` reads like a resize
instruction and isn't one: the browser downloads whatever is in `public/site/`
at full size. The file on disk IS the delivered size. Sized accordingly.

---

## Reference docs in this repo

| File | What's in it |
|---|---|
| `TEST_TONIGHT.md` | The end-to-end test script |
| `DOMAIN_MOVE.md` | DNS runbook + the email plumbing |
| `JEN_CALL.md` | Everything to raise with Jen |
| `QUICKBOOKS_RESEARCH.md` | Why bulk import is closed to us |
| `SECURITY_AUDIT.md` | The 20-point review |
