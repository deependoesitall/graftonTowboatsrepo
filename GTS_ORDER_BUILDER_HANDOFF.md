# GTS — Staff Order Builder + Paper-Form Photo Import
### Handoff brief for a second AI collaborator

You are being handed a working feature and an unbuilt one. Read the constraints
before proposing anything — several obvious approaches have already been ruled
out for reasons that aren't visible from the code alone.

---

## 1. The business problem

Grafton Towboat Services (GTS) delivers groceries and supplies to towboats on
the Mississippi/Illinois confluence at Grafton, IL. Groceries come from
Sinclair's Foods in Jerseyville. A web ordering platform now exists, but **most
real orders still arrive on paper**:

1. The boat's cook prints Sinclair's order form — a ~20-page catalogue with
   columns `Category | UPC | Item Description | PKG SIZE | QNTY | UOM | price`.
2. He pencils quantities into the **QNTY** column, ~30–60 marks across 20 pages.
3. He writes the header by hand at the top of page 1: Company Name, Vessel Name,
   Vessel Phone. (`Vessel Direction`, `Order Date`, `Vessel ETA`, `Fulfillment`,
   `Customer PO#` are printed but usually left blank.)
4. He scans it and emails it to Sinclair's.

Someone at GTS then re-types that into the system. That transcription step is
the bottleneck this work targets.

**Key fact:** the printed form and the product catalogue are generated from the
same source spreadsheet. They are the same list, in the same order.

---

## 2. Stack

| | |
|---|---|
| Framework | Next.js 15, App Router, TypeScript (`strict: false`) |
| Data | Supabase / Postgres, accessed via `@supabase/supabase-js` |
| Hosting | Vercel (serverless; `maxDuration` 30s on the order route) |
| Auth (staff) | Signed JWT in `sessionStorage`/`localStorage`, sent as `Authorization: Bearer`. Server side: `requireAdmin(req)` from `src/lib/admin-auth-server.ts`. Client side: `adminFetch()` from `src/lib/admin-auth.ts`. |
| Styling | Tailwind + a few shared classes: `card-base`, `input-base`, `label-base`, `btn-primary`, `btn-outline` |

### Relevant `products` columns

```
id uuid, upc text|null, description text, category text, sub_category text,
pkg_size text|null, uom text|null, price numeric,
quantity_step numeric|null      -- 0.25 for by-the-pound deli, 1 for counted
billed_by_weight boolean,
form_section text|null          -- Meat / Dairy / Produce / Grocery / Cold Deli / Bakery
form_subsection text|null       -- Beef / Pork / Poultry / Cheese / …
form_seq integer|null           -- GLOBAL POSITION ON THE PAPER FORM
is_active boolean, is_available boolean,
store_only boolean              -- true = full-store import (~40k rows), NOT on the paper form
```

`form_section` / `form_subsection` / `form_seq` come from **migration 035**,
backfilled from `src/data/order-form-layout.json` by matching
UPC → description+pack → description. They exist because the barges demanded it:
*"It is very key that the barges see the order as they see it on paper now."*

**`form_seq` is the single most important fact in this document.** It means the
database can reproduce the printed page order exactly.

---

## 3. What is built and deployed

Four files:

| File | Role |
|---|---|
| `src/app/admin/orders/new/page.tsx` | The builder UI (~1,100 lines) |
| `src/app/api/admin/catalog-sheet/route.ts` | Whole form as JSON, ordered by `form_seq` |
| `src/app/api/admin/order-defaults/route.ts` | Every vessel's last-known header, derived from past orders |
| `src/app/admin/orders/page.tsx` | Added the "New order" button (there was no way to create an order from admin at all) |

### Flow

`Boat → Items → Check`

**Boat.** Type a boat name; pick it; the whole header fills from that vessel's
most recent order (captain, phone, vessel email, terminal, boat/van, VHF,
approach side). `po_number` deliberately does **not** carry forward — it is
per-delivery, and a stale PO gets an Ingram invoice rejected by their AP.

**Items.** Three modes:

- **Order form** (default) — the entire catalogue rendered in `form_seq` order
  with section/subsection headings and one quantity box per row. The `+`/`−`
  buttons are `tabIndex={-1}` so **Tab walks straight down the quantity column**
  the way a finger walks down the paper. `content-visibility: auto` keeps ~1,200
  DOM rows cheap without virtualising (virtualisation would break Tab order).
- **Quick add** — one input. A ≥6-digit entry is matched as a UPC and wins
  outright with no result list. Otherwise substring match on description.
- **Paste a list** — parses `3 name`, `name x3`, `UPC qty`, `qty x UPC`, bare
  name → 1. **Never adds silently:** ambiguous or unmatched lines go into a
  "needs a human" list.

**Check.** Line review, then submit.

### Submission

Posts to the **existing public** `POST /api/orders` — the same endpoint the
customer storefront uses. This was deliberate: that route already handles
pricing, sale/coupon evaluation, COD apportionment, the vessel confirmation
email, the Sinclair's CC, and the staff web-push fan-out. A parallel
"admin order" endpoint would be a second copy of all of it that would drift.

Provenance is recorded as a line prepended to `vessel.notes`:
`Entered by <staff name> from a paper order.` — chosen because `notes` already
renders in admin, on the pick sheet and in the emails, so it is visible to
everyone who touches the order without adding a column nobody would look at.

Payload shape (zod-validated, unknown keys stripped):

```ts
{
  vessel: {
    company_name, contact_name, phone,        // all required, min(1)
    vessel_email | email,                     // at least one required
    vessel_name, vessel_type, captain_name, captain_phone,
    terminal_name, arrival_date, arrival_time,
    delivery_method: 'boat'|'van'|'',
    approach_side, vhf_channel, po_number,
    crew_change: 'yes'|'no'|'maybe', notes
  },
  items: [{ product_id, description, category, pkg_size, uom,
            price, quantity, image_url, paid_by: 'vessel'|'deck'|'cod' }],
  cod_payments: []
}
```

### UPC matching

Both leading-zero-insensitive:

```ts
const digits = (s) => s.replace(/\D+/g, '');
const upcKey = (s) => digits(s || '').replace(/^0+/, '');
```

The printed form, the register and the catalogue don't agree on whether UPC-A
carries its leading zero, and a human typing one off a page copies what's
printed.

---

## 4. The unbuilt feature: photo import

### Goal

Upload/photograph the marked scan → get a proposed order → confirm → submit
through the same builder.

### What the input actually looks like

- Scanned at ~150–200 dpi, grayscale, slightly skewed, occasional staple shadow
  and punch-hole marks in the left margin.
- Fixed table grid, ruled lines on all sides of every cell.
- Printed text is clean machine type. **Marks are pencil/pen digits** in the
  QNTY cell — sometimes a word instead (`"Cream"`, `"Cs"` for case).
- Footer reads `Page N of 5076` — an Excel print artifact, not a real count.
  Actual pages ≈ 20–26.
- **Meat-counter rows have a blank UPC column.** Roughly the whole `Meat`
  section before `SMOKED MEAT/LUNCHMEAT` has no UPC and must be matched by
  description + pack size.

### The design decision that matters

**Splitting detection from recognition.**

- *Which rows are marked* → detectable with high reliability. It is a binary
  ink-present question inside a known cell, on a ruled grid.
- *What digit is written* → handwriting OCR, and unreliable on this input.

A misread quantity **fails silently**: the boat gets 2 briskets instead of 3 and
nobody learns until the dock. So the proposed design is:

> **The machine finds the rows. The human reads the numbers.**

Reduce 1,200 catalogue rows to the ~40 the cook actually marked, show each one
with a **cropped image of that person's own handwriting** next to an empty
quantity box, and let the operator type while looking at the crop. That removes
~97% of the work and adds zero silent-failure risk.

If a digit classifier is added later it should **pre-fill, never commit** — the
crop stays on screen beside the number for confirmation.

### Suggested pipeline

1. **Ingest** — PDF or images. Rasterise pages client-side (`pdf.js`) or accept
   phone photos.
2. **Deskew + grid detection** — Hough or projection-profile on the ruled lines
   to recover row baselines and column x-boundaries. The QNTY column is a fixed
   fraction of the table width; anchor it off the detected column separators
   rather than a hardcoded pixel offset.
3. **Row → catalogue alignment.** Two options:
   - (a) OCR the *printed* UPC/description column — machine type, reliable —
     and match to `products` by `upcKey`, falling back to fuzzy description
     match for the UPC-less meat rows.
   - (b) Use ordinal position: page *N*, row *k* maps to a known `form_seq`
     offset. Cheaper, but breaks the moment the catalogue changes and the
     printed form the cook is holding is from an older revision.
   **(a) is safer. (b) is a useful cross-check against (a).**
4. **Ink detection** — per-row dark-pixel ratio inside the QNTY cell, with a
   threshold calibrated against that page's own background (scans vary).
5. **Review screen** — row description, matched product, handwriting crop,
   quantity input. Unmatched rows and low-confidence matches listed separately.
6. Hand the confirmed `{product_id, quantity}` set into the existing builder's
   `qty` state. It already handles everything downstream.

### Where it should run

Client-side Canvas is viable for the whole pipeline and avoids a paid vision
API and Vercel's 30s function limit. Trade-off: phone CPUs on 20 pages.
Worth benchmarking before committing.

---

## 5. Constraints that are not negotiable

- **No alcohol**, ever, anywhere in this system.
- Nothing may state or imply that **Sinclair's performs delivery**. Their staff
  pull groceries; GTS carries them. This is the partner's explicit condition.
- **QuickBooks Online is the system of record for invoicing.** The per-order
  email is a receipt, not a bill. Mary Karen invoices at month end.
- Sinclair's courtesy grocery lines are **not taxed** in QBO.
- **The register is the price authority**, not the catalogue. Shelf prices
  drift; the builder says so on the review screen.
- Order status pipeline: `new → in_progress → shopped → fulfilled`.
  **Sinclair's stops at `shopped`.** `fulfilled` fires the customer's final
  email carrying GTS's delivery fee and billing terms — it is GTS's to press.

---

## 6. Approach and reasoning

Written out because the reasoning is the part that's hard to reconstruct from
the diff, and because two of these calls are the ones most likely to be argued
with.

**The job is transcription, not shopping.** The existing customer storefront is
a shopping tool: cards, photographs, categories, related items, an add-to-cart
animation. Every one of those is correct for discovery and wrong for someone
copying forty numbers off a page. Shopping wants the eye to roam; transcription
wants the eye to never leave the line it's on. That single distinction drove the
whole UI — flat rows, no images, section headings inline rather than as
containers, and a quantity box as the only focusable control per row.

**`form_seq` was already the answer.** The instinct was to design a clever entry
screen. The better move was noticing that migration 035 already stores the
paper form's exact row order, because the barges demanded the *customer* view
match their paper. Reusing it means the operator's screen and the operator's
scan are the same document. No mapping, no mental translation, no scrolling to
find where you were.

**Tab order is a feature, not an accident.** `tabIndex={-1}` on the `+`/`−`
buttons is the difference between one keypress per line and four. It also rules
out list virtualisation, which would be the obvious performance fix — a
virtualised list removes rows from the DOM and Tab stops working. Hence
`content-visibility: auto` instead: every row stays in the document, the browser
just skips laying out what's off-screen.

**Reuse the order endpoint, don't fork it.** The tempting design is a dedicated
`POST /api/admin/orders` that does exactly what staff need. It would have been
faster to write and it would have been wrong: pricing, sale evaluation, COD
apportionment, the confirmation email, the Sinclair's CC rule and the push
fan-out all live in `POST /api/orders`, and a second copy drifts in the
direction of whichever path gets tested less. A staff-built order *is* an order.

**Provenance in `notes`, not a new column.** A `placed_by_staff` boolean would
be cleaner data modelling and worse product: nobody looking at a strange order
would think to check it. `notes` already renders in admin, on the pick sheet and
in both emails, so the line reaches every human who touches the order.

**Paste refuses to guess.** A paste importer that silently resolves ambiguity is
worse than no paste importer. `CAB CHUCK ROAST ~5lb` and `CAB CHUCK ROAST ~8lb`
differ by one character and $27, and the wrong one lands on an invoice a barge
line's AP will dispute. Two candidates is a question for a person.

**Photo import was scoped down deliberately, and this is the call most likely to
be pushed back on.** The ask was "read the sheet". The answer is "find the marked
rows and let a human read them", because the failure modes are asymmetric: a
missed row is visible (the operator sees the gap against their paper), a misread
digit is invisible until delivery. Splitting detection from recognition keeps
~97% of the time saved and moves the remaining risk to where a human is already
looking. Disagreement welcome — but argue against the asymmetry, not the effort.

---

## 7. Hiccups, risks and what has not been verified

Read this before assuming anything in section 3 is battle-tested.

**Shipped without a local build or a runtime test.** ~1,100 lines of new TSX
written in one pass, pushed, and it compiled and deployed on Vercel. It has not
been exercised against real data — no order has been placed through it yet. The
most likely breakages, in order:

1. `products.form_seq` may be **null for most rows** if the "Apply Order-Form
   Layout" backfill was never run in production. Everything still works, but the
   sheet degrades to alphabetical-within-section and loses its entire point.
   *Check first:* `select count(*) from products where form_seq is not null;`
   Expect roughly 1,100–1,200.
2. `store_only` is filtered to `false`. If that column was never populated,
   the ~40,000-row full-store import comes down with the payload and the page
   will crawl.
3. The payload is capped at 5,000 rows. Fine today; silently truncating if the
   catalogue grows.

**`tsconfig` has `"strict": false`.** Null-safety bugs in this code will not be
caught at compile time. Several fields are typed `string | null` in the database
and consumed as strings.

**A `.select()` string must be a single literal.** supabase-js parses it *as a
type* to infer the row shape. Written as `'a, b, ' + 'c'` inference collapses to
`string` and every column access fails to compile as `GenericStringError`, which
names the symptom and not the cause. This broke a production build once already;
both new routes carry a warning comment.

**`src/middleware.ts` must stay in `src/`.** With a `src` directory, a
`middleware.ts` at the repo root is **silently ignored** — no warning, no error,
no hint in the Vercel dashboard. It lived at the root for months and never ran.

**Serverless invocation limits.** `POST /api/orders` has `maxDuration: 30`. It
does coupon evaluation, a PDF-bearing email, and the push fan-out before it
returns. A very large paper order (60+ lines) has not been timed.

**Known-adjacent bugs fixed the same night, relevant if you touch these areas:**

- *Push notifications fired only sometimes.* Cause: a push endpoint belongs to a
  browser **on an origin**, not to an app. Both staff apps now serve from the
  apex, so a phone with both installed has one subscription; the table upserts on
  endpoint, so whichever app last enabled notifications overwrote the row's
  `is_sinclair` flag for the whole device. The fan-out filtered on that flag, so
  service-only orders silently reached nobody. Now routed on the stored **role**,
  which doesn't move when someone installs a second app.
- *Admin login showed "Invalid username or password" for every failure*,
  including 5xx. A server error was indistinguishable from a typo. Now
  differentiated by status code.
- *Creating a user lowercased the username; editing one did not.* Login looks up
  `username.toLowerCase()`, so renaming an account through the Users page locked
  that person out with a message blaming their password.

**Data hazards worth knowing:**

- `generateOrderNumber()` is `GTS-YYMMDD-` plus **four random digits** — 9,000
  possibilities per day. At Ingram's expected 30–40 boats a collision is a matter
  of time, and invoicing keys off that number.
- Order emails default to the **real Sinclair's store inbox and the owner's
  personal address** when `SINCLAIRS_ORDER_EMAILS` is unset. Any test order
  placed without overriding it reaches the partner as a live order.
- Bare `YYYY-MM-DD` dates must not be passed through `new Date()` and rendered
  in `America/Chicago` — that lands on the previous day. Hand-format them.

**Unverified assumptions about the paper form itself:** page count, dpi, grid
regularity and the frequency of non-numeric marks are all read from a **single
sample** — one scanned order (`10 Aug 2026 WSN.pdf`, W. Scott Noble / Ingram).
Anyone building the photo importer should collect a dozen real scans first. One
sample is enough to design against and not enough to tune thresholds against.

---

## 8. Open questions worth your opinion

1. **Row alignment strategy** — printed-column OCR vs. ordinal `form_seq`
   position vs. both with disagreement flagged. Which fails more gracefully
   when the cook is holding a six-month-old printout?
2. **The UPC-less meat rows.** ~150 rows, description-only matching, and the
   descriptions are terse (`CAB CHUCK ROAST ~5lb`). Is there a better key than
   fuzzy description + pack size?
3. **Words in the QNTY column.** `"Cream"` appeared in a bacon row — probably a
   substitution note, not a quantity. Should non-numeric marks route to the
   order's notes rather than being dropped?
4. **Is client-side the right call**, or is a short-lived server step with a
   real CV library worth the added infrastructure?
5. **Speed check on the built feature.** The manual builder is the fallback
   under photo import forever. Is there a faster interaction than
   type-number-Tab for a 40-line transcription?
