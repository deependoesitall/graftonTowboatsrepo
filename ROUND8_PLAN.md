# Round 8 — Post-Demo Revisions
**Source:** In-person demo at Sinclair's Foods, July 10, 2026 (Dave, Jen, Laura + staff) — full audio transcript, plus Dave's follow-up text (Deck orders).
**Status:** Planning locked July 19. **BUILD STARTED July 19** — done so far: P1-2 barcode pick sheet (src/lib/barcode.ts + src/lib/pick-sheet.ts, print buttons in OrderDetailModal + orders list), P1-8 print→in-progress prompt, P1-5 COD payment rework (Venmo/Cash App handle request flow, no cash, no "due on delivery", 5% fee editable in admin, migration 033 incl. deck paid_by future-proofing). **SECOND BUILD PASS (July 19, later):** COD fee now a TOGGLEABLE feature (migration 034: admin_settings.cod_fee_enabled + cod_fee_percent; Sinclair's-tab toggle, manager-editable; checkout reads effective % from /api/order-config; server snapshots at order create; all displays hide fee wording at 0%). DECK charge type UI shipped end-to-end (Grocery/Deck/COD per-line selector, deck subtotals in checkout + review + admin modal + email + PDF, deck flags + separate-line splits in Mary's billing packet). Checkout email flip shipped (vessel email REQUIRED — confirmations/shopped emails route to vessel email first; billing email optional with month-end hint; server accepts legacy carts with either email). Write-in verbiage updated ("Didn't find what you were looking for? No problem — we'll get it"). Other-pickup was already absent from Additional Services (nothing to remove — confirm with Jen whether she also meant pausing Parts Pickup store-runs).
**THIRD BUILD PASS (July 19, evening) — ORDER-FORM SEQUENCING SHIPPED.** Paper form received (CSV, 1,412 rows) → parsed to `src/data/order-form-layout.json`: **1,162 items · 96 subsections · section order Meat → Dairy → Produce → Grocery → Cold Deli → Bakery** (exactly the "starts with meat, all the way down" flow). Built: migration `035_order_form_layout.sql` (products.form_section/form_subsection/form_seq + `apply_form_layout()` bulk RPC — one call, not 1,162 REST updates); admin → Products → **"Apply Order-Form Layout"** button (matches UPC → desc+pack → unambiguous desc; reports matched/unmatched counts, full unmatched list in console — meat cuts have no UPCs so expect some manual review); catalog + products API now sort by `form_seq` first (form items in paper order, off-form items after alphabetically — ready for the full-store import); ProductGrid renders the form's own subsection labels (Beef / Pork / Condiments / …) as full-width group headers, plus a "More from the store" divider when off-form items begin.
⚠ Deploy order: **apply 026–035 BEFORE deploying** — catalog queries now reference form_seq and will error without 035.
After deploy: click "Apply Order-Form Layout" once, review unmatched list (mostly UPC-less meat cuts), fix stragglers by hand.
**FOURTH BUILD PASS (July 19, night) — cleanup + automation.** Layout apply ran in prod: 1,145/1,162 matched (UPC 1,022 · desc+pack 123), 17 unmatched (Blue Bell flavors sharing one UPC, Coffeemate dupes, UPC-less items). Fixed React hydration error #418 (AdminNav + orders/products pages read localStorage roles during render — now resolved post-mount). ApplyFormLayoutButton alert()/confirm() replaced with a proper panel (summary cards + scrollable unmatched list + guidance). **NIGHTLY AUTO-SYNC BUILT** — no more admin-panel clicking: migration `036_nightly_catalog_sync.sql` (catalog_sync_state checkpoint + apply_enrich_updates bulk RPC); `src/lib/freshop-sync.ts` (server mirrors of the client enrich mappers — keep in sync!); `src/lib/form-layout-apply.ts` (shared engine, admin route now thin); `/api/cron/catalog-sync` (chunked: 8 pages/run, 1.5s pacing, DB checkpoint, resumes across invocations — NCR rate-limits datacenter IPs so one-shot server sync is impossible; final chunk re-applies form layout + logs one activity entry); vercel.json cron 05:05 UTC daily (Hobby-safe kickoff) + `.github/workflows/catalog-sync.yml` every 15 min 05:00–08:45 UTC drives the chunks. **Setup: add CRON_SECRET env in Vercel AND as a GitHub Actions repo secret (same value).** Manual buttons still work for on-demand runs.
Remaining P1: full-store import + rest-of-store flows · coupon toggle verify. Cleanup task: fix the 17 unmatched (give Blue Bell flavors/Coffeemate variants distinct UPCs or matching names in the catalog).

---

## P1 — Must ship (confirmed in the room)

### 1. Order-form item sequencing (customer catalog) — THE selling point
Barges must see items in the **exact order of the paper order form** — "It is very key that the barges see the order as they see it on paper now."
- Categories appear in form order (Meat first → down the line). Within a category, items follow the form's row order (e.g. Meat: poultry → pork → beef, corned beef last).
- "All items" view = starts at the first meat item, runs the entire form top to bottom.
- Section labels match the form's own labels (Poultry / Pork / Beef etc.), not generic categories.
- This is ORDERING view only. Shopping/pick views keep store-walkpath order (already synced from Freshop `fulfillment_walkpath.sequence`).
- **Subcategories within departments (Jen's notes):** each department gets navigable subcategories — e.g. Meat → Beef / Pork / Chicken / Seafood / Deli Meat — so cooks can jump straight to a row instead of scrolling the whole department.
- **Implementation:** add `form_section` (department) + `form_subsection` (Beef/Pork/…) + `form_seq` to products; drive category order, subcategory chips, in-category sort, and All Items from them. Search results for order-form items also sort by `form_seq`.
- **Dependency:** need the paper order form itself from Dave/Jen to transcribe the sequence + subsection labels.

### 2. Barcode pick sheet (print) — replaces their POS tag workflow
They currently scan-gun every item to "request a tag," print tags at the POS, hand-write quantities, then scan tags at the register. Fresh Shop prints orders with barcodes; ours must too.
- Printable order sheet with **scannable barcode per line**, plus item name, qty, pack size, location.
- Barcodes are generated from the UPC digits we already sync (bwip-js, UPC-A). Note: Freshop has no barcode-image endpoint — their printouts generate bars from the same UPC numbers; identical bars to the product package, so the POS gun reads them the same.
- **Safety rails:** normalize UPCs + validate check digits before rendering; items with bad/missing UPCs are flagged (printed without a barcode) never mis-encoded. **Go/no-go test first:** one-page sample of ~10 real Kilpatrick items → Dave scans at the register with the POS gun → only then wire into the order flow.
- **Weighable items get NO barcode (confirmed by Dave July 19 + shelf-label photos):** Sinclair's uses price-embedded UPCs — catalog UPC is item code + five trailing zeros (e.g. salami `20529100000`); the scale label on each package embeds the actual price (`0 205291 005097` = item 05291, $5.09, check 7). Our catalog UPC would scan $0.00. Pick sheet prints a "scan the package label" marker + blank weight line instead; picker scans the tray's own label (their current workflow) and keys the weight into our shopping mode (auto-calc already matches register).
- **Weighable detection rule:** UPC starts with 2 + last five digits are zeros → weighable. Use during full-store import to set billed_by_weight, cross-checked against UOM=LB.
- **Compact grid layout** — Dave: "the smaller the best" (save paper).
- Sorted in **store walk order** (1A → end) using location_seq — "keeps from going to that end of the store and back."
- **Department splits:** Meat prints as its own section/page (goes to meat dept), Produce its own (produce dept), grocery the rest. Page-break per department.
- Substitutions: picker writes sub UPC on paper, keys it in later — no code needed beyond existing sub flow.
- Deepen has a sample Kilpatrick tag printout from the visit — match its density.

### 3. Full-store catalog + "shop the rest of the store" (DECIDED: full import + both flows)
Order form stays the default view; the whole store (~13,000 items) becomes reachable.
- Import full Freshop catalog flagged `full_store` (not order-form), hidden from default browse. Excludes alcohol (can't deliver). Fixes missing website items (Calhoun peaches, seasonal produce).
- **Explicit filter distinction (Jen's notes):** "Barge Order Form" vs "Store" is a first-class filter — the flag drives the default view, the expanders, and an admin-side product filter so Sinclair's can manage the two sets separately.
- **Per-category expander:** in Condiments, a button like "Don't see it? Browse all condiments Sinclair's carries" — scoped to that category only, never the whole store at once ("not to overwhelm them").
- **"Shop the rest of the store" step** after cart review / at end of the form — Dave's "tab at the end" idea. Search within it (spices, shampoo…).
- Search: order-form items ranked first; full-store matches shown below or behind a "more from the full store" reveal.
- Keeps write-ins for true not-carried items (see P1-6 verbiage).

### 4. Deck orders — NEW (Dave's text after demo)
Third per-line charge type alongside Vessel Account and COD: **Deck**.
- Deck items (toilet paper, paper towels, towels, cleaning…) are charged to the company but do **NOT** count against the boat's grocery allowance.
- Both Grocery (vessel) and Deck bill to the company — but must be **listed separately**: separate subtotal at checkout, separate section on confirmation email, PDF, admin order view, and Mary's billing packet (separate line/section per invoice, not mixed into grocery total).
- **Implementation:** `paid_by` gains `'deck'`; three subtotals in checkout step 1; billing packet + reports split vessel vs deck; migration required.
- **Open:** confirm with Dave/Jen whether deck needs its own fee treatment (assume none — treated like vessel account, just separated).

### 5. COD payment rework
- **Remove "due on delivery"** everywhere — Dave: "they're really not. They have to call us to pay." Reword the COD payment box.
- **Venmo/Cash App = request-based:** customer enters THEIR handle; Sinclair's/GTS sends a payment *request*. Never display Sinclair's/GTS handles or accept inbound sends ("write not to send anything to our Venmo"). Copy: "Enter your Venmo/Cash App — we'll send a payment request."
- **5% COD fee:** default 5% applied to COD lines, **editable by admin per order** (up for big-ticket, down when it's outrageous — "$600 phone at 5% = fine; don't lose the credit-card surcharge either").
- **External (Walmart-link) COD items:** admin sets/edits the price line-by-line ($300 TV → $325), change is immediate, fee applies on top. External items currently excluded from COD total — once priced by admin they must flow into the COD total + invoice.
- **Credit card:** keep "no payment info ever on this site / we'll call you." Soften the call-time wording (no hard "8 a.m." promise — "around" the preferred time).
- Bulk "make everything COD" toggle in cart (Laura's ask — boats often place CODs as a second, separate order): one tap flips all lines to COD.

### 6. Checkout field fixes
- **Flip required emails:** vessel/order-contact email REQUIRED; billing/company email OPTIONAL. "Ingram home office doesn't want an email every time they place an order — they want the bill at the end."
- Write-in section verbiage: **"Didn't find what you were looking for? No problem — we'll get it."** Plus clear note that write-ins aren't included in the estimated total.
- **Remove third-party store pickup from Additional Services** ("Let's pause on that one" — GTS won't run to Best Buy). Sinclair's-side Walmart links (other-pickup card) stay.
- PO number: stays optional (boats don't have one at order time); verify admin can add/edit PO on the back end after submission. Saved-to-account behavior confirmed good (Arco has a yearly PO).

### 7. Coupon disable — fix the toggle error
Sinclair's is OUT on digital coupons (Sinclair card → points → free milk/chips kills margins). Weekly ad STAYS — they're fine with it.
- **BUG — ROOT CAUSE FOUND (July 19):** error is `Could not find the 'show_digital_coupons' column of 'admin_settings' in the schema cache` → the column (created in `026_digital_coupons_toggle.sql`) was never applied to production. **Fix = apply pending migrations 026→032 in Supabase (SQL editor or `supabase db push`) — no code change.** Do this FIRST in Wave 1: 027 (COD columns), 028–029 (zone/walkpath), 030 (decimal qty), 031 (qty rules), 032 (coupon engine) are likely all missing in prod, meaning several shipped features are half-broken right now.
- When off: coupons vanish entirely (catalog strip, /coupons page, checkout discount preview, settings clutter). Round 7 engine stays dormant in code — don't rip it out.

### 8. Print → in-progress prompt
- On print: prompt **"Mark as In Progress? (locks customer changes)"** — user can decline (print early for a future-day order, customer keeps editing) or accept (locked).
- The lock itself stays as-is: in-progress = customer can't touch it; no advertised cutoff anywhere ("I wouldn't even advertise one way or another" — they'll call).

---

## Jen's meeting notes — cross-reference (added July 19)
Her 7 items vs this plan: (1) Disable coupons → P1-7 ✔ diagnosed, apply migrations. (2) Barge-form vs Store filters → P1-3 (filter framing added above). (3) Order form organization + department subcategories → P1-1 (subcategories added above). (4) Venmo + Cash App → P1-5 **BUILT**. (5) Email required → P1-6 **BUILT** (vessel email required). (6) Remove order-cutoff messaging → **VERIFIED already true** — no customer-facing edit-window messaging exists anywhere; only admin print prompts mention the lock. Customers submit, then call Sinclair's for changes, exactly as she wants. (7) POS barcode sheets → P1-2 **BUILT**, pending Dave's register scan test.
Note: the checkout's ETA cutoff hint ("orders need N hours before arrival") is a different feature — the order-placement buffer Dave configured — and stays.

---

## P2 — Next after P1

- **Featured / "must-have right now" box** at top of catalog: Calhoun peaches, watermelons, tomatoes, meat seasoning — owner/manager curated. "The boats go crazy." Also a sales hook for items not on the order form.
- **Custom birthday cakes:** surface as an orderable item with a notes field (writing, colors, kind). Scott Noble boat just ordered one — they want it highlighted.
- **"Changed since printed" badge:** if a customer edits after an admin printed but didn't lock, flag the order in the dashboard (closes Dave's "I don't catch the change" liability gap when he declines the print-lock prompt).
- **Product name cleanup:** fix abbreviation dumps ("ALMND") — prefer website names over catalog spreadsheet names during enrich.
- **Images:** Dave emailed their ad group for product photo files; bakery/deli gaps (cheesecakes, chicken salad) get photographed in-store. Ingest when received.
- **Weekly-ad sync timing:** ad posts Wednesday ~6 a.m.; nightly sync at 12:05 a.m. is fine (confirmed it never shows a stale ad) — optionally add a Wednesday-morning re-sync for same-day freshness.
- **Email confirmation wording:** no cutoff language; keep it neutral ("need a change? call us and we'll do our best" at most).

---

## Backlog / future (parked in the room)

- Delivery fees built into orders — per company/boat, manual at first (Ingram flat vs Arco/ACBL split billing). "Wanted to get bugs worked out first."
- Live inventory counts ("4 remaining") — Fresh Shop doesn't do it either; Dave curious, not asked for.
- Barcode-scan verify / scan-to-substitute in shopping mode (Fresh Shop iPad parity) — pairs with them maybe buying tablets.
- Restricted-items list beyond alcohol — Dave asking Ingram; nothing else blocked today.
- Meat-seasoning promotions / goody-bag tie-ins; highlighted local items as marketing.
- Tablets/handhelds for paperless shopping mode — their hardware decision, not code.

## Confirmed working / liked at demo — do NOT touch
Weekly ad embed + Wed–Tue wording · refrigerated-van messaging · estimated-total language · clear cart · COD per-person line-by-line breakdown · credit-card "we'll call you" flow · account saves (vessel info, PO, favorites, reorder) · multi-shopper sync · weight auto-calc · admin add-item-on-the-fly · in-progress lock · quick in-progress toggle from order list · order PDFs/emails.

## Data needed (blockers)
| Item | From | Blocks |
|---|---|---|
| Paper order form (exact sequence + section labels) | Dave/Jen | P1-1 |
| Coupon-toggle error screenshot | Deepen (next session) | P1-7 |
| Sample tag printout (have it — Kilpatrick) | ✔ in hand | P1-2 layout |
| Product photo files from ad group | Dave | P2 images |
| Deck fee treatment + any deck-specific rules | Dave/Jen | P1-4 polish |
| Ingram restricted-items answer | Dave | backlog |

## Suggested build order
1. **Wave 1 (foundation):** coupon-toggle bug fix · checkout field fixes · COD wording/fee/handles · print prompt — small, independent, high demo-credibility.
2. **Wave 2 (schema-heavy):** Deck charge type (migration + checkout + billing packet) · barcode pick sheet.
3. **Wave 3 (data-heavy):** full-store import + rest-of-store flows · order-form sequencing (once the paper form arrives — start schema now, backfill sequence when received).
