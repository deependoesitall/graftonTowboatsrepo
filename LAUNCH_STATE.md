# Where this project stands — Sept 10, 2026

Written so a fresh session (or a fresh person) can pick up without re-deriving
anything. Everything below was verified against the live site or the code, not
recalled.

---

## 🔴 DO THESE FIRST — nothing else matters until they're done

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
`gts-logo.png` is still 748 KB — Windows denies write access to it (Controlled
Folder Access), so the compressed copy sits beside it as `gts-logo-1.png`.

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

**Everything else still uses the old square `gts-logo.png` (1080×1080), on
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

- `gts-badge.png` — a square crop of the new badge. Nothing references it.
- `gts-logo-1.png` — the compressed 512px version of the OLD logo, saved here
  under Windows' auto-rename. Windows Controlled Folder Access denies writes to
  `gts-logo.png` itself, so the 748 KB original is still what ships. Clearing
  that exception and renaming this over it saves ~700 KB.
- `logo-circle.png` — 1.2 MB, referenced by nothing, long dead.

## Favicon — Sept 10, half done

New favicon artwork (rounded square, dark ship over waves, gradient ground).
Wired through Next's file convention, so no code change and no metadata edit:
the nearest `icon.png` in the route tree wins.

| File | Colour | Serves |
|---|---|---|
| `src/app/shop/icon.png` | **red** — amber→red | ✅ done — `shop.graftontowboatservices.com`, install page included |
| `src/app/icon.png` | green — gold→green | ❌ **NOT DONE** — Windows denied the write |

The red is the same artwork with the background gradient rotated and the
silhouette warmed; at 32 px in a tab strip the two are unmistakable, which is
the point — Sinclair's staff and GTS staff often have both open.

### ⚠️ `src/app/icon.png` still has to be replaced by hand

Windows Controlled Folder Access denies writes to it (third file today). The
name is fixed by Next's app-router convention, so it can't be worked around
with a new filename the way `gts-logo.png` was.

**Until it's replaced, every tab except the Sinclair's app still shows the old
logo.** Fix is either: clear the exception under Windows Security → Ransomware
protection → Allow an app through Controlled folder access, or drop the file
over that path manually.

Note this is a browser-tab favicon only. **Home-screen app icons are
deliberately untouched** — `admin-icon.png`, `shop-icon.png` and the
`/icon.svg` maskable are all as they were.

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
