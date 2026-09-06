# Grafton Towboat Services — Project Brief

*A self-contained description of what this system is, who it's for, and how it
grew from "replace a paper order form" into a platform running two companies'
daily operations. Written to hand to someone with zero prior context.*

*Current as of September 5, 2026.*

---

## 1. The business

**Grafton Towboat Services (GTS)** is a small, family-owned company in Grafton,
Illinois, at the confluence of the Mississippi and Illinois rivers — **Mile
Marker 219 (Mississippi) / Mile Marker 0 (Illinois)**. They monitor Channel 68
via Grafton Harbor.

Towboats push barges up and down these rivers for weeks at a time and can't stop
to shop. GTS meets them — by boat, or by refrigerated van at a terminal — and
delivers:

- **Groceries** (the bulk of the business), fulfilled by a partner grocer
- **Crew change** — driving crew to and from the boat
- **Parts and package delivery**
- **Boat/deck supplies**

Their customers are barge lines: **Ingram, ACBL, Artco, Reliant, Marquette,
Kirby, Excel Marine, Canal, Florida Marine, Hines Furlong, Southern Devall,
Tennessee Valley Towing.** A single line like Ingram runs 15+ boats, and each
boat is billed separately.

**Volume:** 171 deliveries in 2026 YTD, ~$54k in delivery fees, ~$104k in
groceries passing through.

### The grocery partner

**Sinclair's Foods**, an independent grocer in Jerseyville, IL (~20 min away).
GTS places the order, Sinclair's shops it, GTS collects and delivers. Sinclair's
runs its e-commerce on **Freshop (an NCR product)**, whose public API turned out
to be reverse-engineerable without auth — which is what makes the whole catalog
integration possible.

The relationship boundary matters and is baked into the product: **boats order
through GTS, not Sinclair's.** Sinclair's owner's son Dave was explicit — he
doesn't want barge lines calling his store about deliveries.

---

## 2. The original ask

**Replace one piece of paper.**

Sinclair's had a "Marine Order Form" — a ~1,400-row spreadsheet that boats
printed, marked up, and emailed or faxed back. It listed everything Sinclair's
would supply to a vessel, organized in the order you'd walk the store.

The ask was: put that form on a website so a cook can tap instead of print.

That's it. That was the whole scope.

---

## 3. How it grew

Every expansion came from a demo. Someone saw it working, understood what was
now possible, and asked for the next thing. What started as one screen became
**six distinct products** sharing a codebase:

1. **The customer ordering site** — the original ask.
2. **A full back office for Sinclair's** — product management, catalog import,
   pricing, out-of-stock, and a picking system that replaced their printed
   receipt and highlighter.
3. **A full back office for GTS** — orders, customers, reports, roles, activity
   log, delivery terms.
4. **A discount/coupon engine** — built completely, wired end to end, then
   **switched off and left dormant** (see below).
5. **A barcode system for Sinclair's register** — printable pick sheets with
   scannable UPC-A barcodes, so an order rings up at their POS.
6. **A deliveries ledger and invoicing system for GTS** — replacing a separate
   Google Sheet, with invoices that generate and send from the site.

### The coupon engine — built, then scrapped

Worth calling out because it's the clearest example of the scope moving.

A complete discount engine was built and integrated: it synced Sinclair's
machine-readable offers from Freshop, evaluated cart eligibility at checkout
(including multi-buy rules like "2 for $1.00"), snapshotted the applied
discounts onto the order, and surfaced savings through the confirmation page,
emails, PDFs, receipts, account history, admin views and billing reports. A
dedicated migration added the discount tables.

Then it was **turned off for good.** Sinclair's card/points program made the
margins unworkable on boat orders. The engine still exists behind a kill switch
in admin settings, dormant. **Sinclair's weekly ad stayed** — that's still
pulled live and displayed, because it drives orders without costing margin.

Two separate bugs were chased before it was properly off, both caused by page-
level reads of `admin_settings` using the anonymous Supabase client against an
RLS-locked table — the read silently returned null and a `?? true` fallback
turned "couldn't read the toggle" into "coupons ON."

### The chronology

| When | What was added | Who asked |
|---|---|---|
| Phase 1 | Catalog, cart, checkout, customer accounts, confirmation email | the original ask |
| **Jul 1** | First Zoom demo with Jen → 17 revisions (mile markers, "estimated total" language, crew-change tri-state, weight-billed items, liability wording) | Jen |
| **Jul 6** | Sinclair's weekly ad embed, digital coupon display, Reports split into Billing/Analytics, 4-step XLSX import wizard, product detail modal | Jen |
| **Jul 7** | COD rework (per-line "paid by", per-crew-member names), billing grouped by company **and vessel**, cross-category search, fleet CTA | Jen |
| **Jul 8** | **Billing packet** — a single branded PDF with cover, per-vessel invoice statements, and per-order item cross-reference sheets | Mary Karen (billing) |
| **Jul 9** | Store walkpath location sync, aisle-grouped shopping mode, "Spark-style" one-item-at-a-time focus mode, live multi-shopper sync | Deepen/Jen |
| **Jul 10 (am)** | Full **coupon/discount engine** built and wired end to end — offer sync, cart eligibility, order snapshots, savings shown everywhere | Jen |
| **Jul 10** | **In-person demo at Sinclair's, Jerseyville. Dave joins the project.** | — |
| **Jul 19–20** | **Barcode pick sheets for the register**, Venmo/CashApp COD with handles + fee, DECK charge type, **full-store import (~20,000 items)**, order-form sequencing, nightly auto-sync. **Coupon engine switched off for good** — Sinclair's card/points killed the margin | Dave |
| **Jul 28** | Register totals with discrepancy flagging, Freshop popularity + "also bought", automated photo matching, manual-edit locks | Dave/Jen |
| **Aug 3** | **Deliveries ledger + rate cards + invoice generator** — replaced a *completely separate* Google Sheet. Invoices now generate and send from the site | Jen/Mary |
| **Aug 25** | Squarespace marketing site rebuild + SEO | Jen |
| **Sept** | Meat size-variant grouping, per-vessel rate overrides, ledger import | Dave's feedback |

### The shape of the scope change

For anyone assessing effort: the original ask was **one screen replacing one
sheet of paper.** What shipped is a two-sided platform serving two separate
companies with different permissions, plus a barcode system that integrates with
a third party's point-of-sale, plus an invoicing and payroll-adjacent ledger, on
62 database migrations.

None of it was scope creep in the pejorative sense — every addition was a real
operational need someone identified once they could see the thing working. But
the distance between "put the order form online" and what exists is very large,
and it happened across roughly nine weeks.

### Three things that were never "an order form"

Worth stating plainly, because they're separate products that happen to live in
one codebase:

1. **A warehouse picking system for Sinclair's.** Before this, they shopped boat
   orders with a printed receipt and a highlighter. Now: aisle-ordered pick
   lists, scannable UPC barcodes, substitution capture, weight entry, and
   multi-shopper sync.
2. **An invoicing system for GTS.** Billing packets, sequential invoice
   generation, register-total reconciliation, Sinclair's receipt attachment.
3. **A deliveries ledger.** Replaced a Google Sheet that had nothing to do with
   groceries — driver pay, hours, rate cards, QuickBooks queue.

And it acquired a **second user organization that pays nothing**: Sinclair's
staff use it every day, and Dave has been directing features since July 10.

---

## 4. What exists today

### Customer side (`order.graftontowboatservices.com`)
- Catalog mirroring the **paper form's exact sequence** — barges shop it top to
  bottom the way they always have. Section/subsection headers preserved.
- Toggle between the **curated barge order form (~1,100 items)** and the **full
  Sinclair's store (~20,000 items)**
- **Size-variant grouping** — the form lists the same cut of meat once per
  weight ("Cab Ribeye 2 PK / 4 PK / 8 PK"); the storefront collapses these to
  one card with a size picker
- Cart with per-line **"paid by"**: vessel account / deck supplies / COD by crew
  member name
- COD handling: Venmo/CashApp handle capture, credit-card callback, configurable
  handling fee, per-person subtotals
- Checkout captures vessel, ETA, delivery method, terminal, PO number
- Accounts, favorites, order history, reorder, Google sign-in
- Sinclair's **weekly ad** pulled live from their circular API
- "Didn't find it?" outside-pickup requests (e.g. a Walmart link)
- *(Digital coupons and the discount engine are built but switched off — see
  §3.)*

### Admin — GTS side
- Orders dashboard, order detail, status pipeline
  (`new → in progress → shopped → fulfilled`)
- **Deliveries ledger** — the old spreadsheet, in-app. Monthly/annual views,
  search, QuickBooks queue, driver pay
- **Rate cards, three tiers**: shared default → barge line → **individual boat**
  (Ingram's Daytime Van Delivery is $350 fleet-wide but $225 for Scott Noble and
  Mike Schmeng — a rule that previously lived only in a red note on a spreadsheet)
- **Billing packet** — one branded PDF for month-end QuickBooks
- **Invoicing that fires from the site** — a branded invoice with a sequential
  GTS number, generated per order and attached to the final email. Grocery-billed
  orders require the actual register total and an uploaded Sinclair's receipt
  before the email can send, so the customer always gets itemized prices
- Reports, activity log, customer management, user management

### Admin — Sinclair's side (scoped role)
- **Shopping mode**: aisle-walk ordering using Sinclair's own configured
  walkpath sequence, pulled from their API
- **Focus mode**: one item at a time, giant buttons, for phone use while pushing
  a cart
- Substitutions with search, out-of-stock marking, actual-weight entry
- **Printable pick sheets** with scannable UPC-A barcodes, split into grocery /
  deck / COD sections, ordered by the store walk
- Product management, photo review, catalog import

### Automation
- **Nightly catalog sync** from Freshop: prices, sale prices, locations,
  walkpath sequence, photos, popularity, new items, delisting reconciliation
- **Photo backfill** — name-matches items lacking photos against Sinclair's site,
  with human review before saving
- **Schema drift detector** — the app checks its own database assumptions on
  every admin page load and shows a red banner naming any missing migration

### Permission model
Four roles across **two companies**:
- `owner` — Jen and family. Everything.
- `gts_manager` — GTS staff. Delivery terms, products, reports.
- `manager` — **Sinclair's staff.** Products and orders only. Cannot see
  delivery fees, billing, or GTS business. **Cannot mark an order fulfilled** —
  that action sends GTS's final invoice email, which Sinclair's must never
  control.
- `staff` — shopping mode only.

---

## 5. Tech stack

- **Next.js 15** (App Router), TypeScript, Tailwind
- **Supabase** — Postgres, RLS, auth, storage. **62 migrations.**
- **Vercel** hosting; cron + GitHub Actions drive the chunked nightly sync
- **Resend** for transactional email; custom HTML email + PDF generation
- **Freshop / NCR public API** — reverse-engineered, no auth required
- Custom pure-TypeScript **UPC-A barcode encoder** (no dependency)
- PGlite used to test SQL migrations against real Postgres before they touch
  production

---

## 6. Hard-won constraints (violate these and things break)

- **Never touch live inventory counts.** Not displayed, not modelled, not
  proposed. Freshop's stock data is unreliable anyway.
- **No browser-native popups.** No `window.confirm` / `alert` / `window.open`
  anywhere. Every confirmation is an in-app dialog; every overlay portals to
  `document.body` (transformed ancestors trap `position: fixed`).
- **No silent guardrails.** Never block an action quietly — communicate state
  instead. A magic threshold that silently refuses is worse than a visible
  problem.
- **Never overwrite `products.description`.** The paper-form matcher depends on
  spreadsheet-style names. Customers see `details` (the full website name) via a
  display helper.
- **Manual edits are locked forever.** Any field a human changes is recorded and
  the nightly sync never overwrites it again.
- **Vessel names are free text, normalized on read.** A new boat must be able to
  order the same day. `"W. Scott Noble"`, `"Scott Noble"` and `"SCOTT NOBLE"`
  collapse to one billing key — and now one rate.
- **Every write is checked.** An unchecked insert once produced an order with
  zero items that still emailed the customer. That class of bug is why the
  schema-drift detector exists.

---

## 7. Where it stands

**Built and deployed.** The system is live at
`order.graftontowboatservices.com` with a verified custom domain, transactional
email, and Google sign-in in production.

**Remaining before public launch:**
- One full end-to-end test order on the live domain
- Soft launch with one or two boats (Reliant, or Ingram regulars) before the
  full fleet
- Squarespace marketing site: add the "Order Now" button, fix a broken link,
  correct the mile markers, add meta descriptions, disable an unused cart
- Media rollout: a how-to-order walkthrough and a short brand film
- Sinclair's needs to supply proper photos for ~260 meat cuts that currently
  share duplicate or mismatched images

**Known deferred work:** child-department sweep for the full-store mirror,
per-person COD payment methods, price fields on outside-pickup lines,
QuickBooks API integration (CSV export exists).

---

## 8. The people

- **Jen Gibson** — GTS owner, primary contact. Also teaches. Owns the
  Squarespace site.
- **Laura, MaryKaren** — co-owners (sisters). Laura manages the domain.
- **Mary Wittman** — billing. Lives in QuickBooks. The billing packet exists for
  her.
- **Jen's father** — co-owner, came from the marina side.
- **Dave Whitman** — Sinclair's Foods (owner's son). Makes the decisions on the
  grocery side. Drove most of the July feature wave.
- **Gloria** — Sinclair's, manages their website day to day.
- **Deepen** — sole developer. This is his first client.

---

## 9. If you're being asked to help with this

Useful things to know before suggesting anything:

- It is **one developer**, not a team. Solutions must be maintainable by one
  person who also has to answer the phone.
- **Vercel is the build gate.** There is no local build step — code is verified
  by TypeScript and deployed.
- **Two companies use the same admin** with different permissions. Any feature
  has to be reasoned about from both sides.
- The **paper form is sacred**. Barge crews have shopped it in the same order for
  years. Anything that reorders or renames it creates friction and gets rejected.
- The business is **~$75k/year in delivery revenue**. Solutions that assume
  enterprise budgets or headcount are not useful.
