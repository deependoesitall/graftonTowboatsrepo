# Grafton Towboat Services — Pre-Launch Checklist

Target: full public fleet launch (~Aug 10, 2026). Work top to bottom — the
first two sections are hard blockers, the rest is data, config, and the one
dress rehearsal that de-risks a public launch.

---

## 1. Deploy & migrate (nothing works until this is done)

- [ ] **Deploy the latest code to Vercel** and confirm the build passes (a lot
      of new code has shipped — a TypeScript error blocks the whole deploy).
- [ ] **Apply migrations in Supabase SQL editor, in order.** Verify 036–040 are
      already applied, then run:
  - [ ] 041 — `register_total` on orders
  - [ ] 042 — `popularity` (+ index)
  - [ ] 043 — `manual_fields` lock
  - [ ] 044 — deliveries ledger + rate cards (companies, service_types, rates, deliveries)
  - [ ] 044b — cleaned 2026 delivery history (132 rows)
  - [ ] 045 — `image_source`
  - [ ] 046 — order delivery billing (`delivery_fee`, `delivery_service_type`, `delivery_company_id`, `bill_for_groceries`)
  - [ ] 047 — order documents (`sinclairs_receipt_url`, `ingram_slip_url`)
  - [ ] 048 — invoice number sequence
  - [ ] 049 — `photo_match_tried_at` (nightly auto photo/name backfill marker)
- [ ] **Create the `order-documents` storage bucket** in Supabase → Storage
      (public), same as the existing `product-images` bucket. Receipts and
      signed Ingram slips upload here.
- [ ] **Set `CRON_SECRET`** in Vercel env vars **and** as a GitHub Actions repo
      secret — same value in both (drives the nightly self-syncing catalog).
- [ ] Confirm `EMAIL_FROM`, `BUSINESS_EMAIL`, and the Supabase keys are set in Vercel.

## 2. Domain, email & auth (external — start now, has lead time)

**With Laura (DNS):**
- [ ] Confirm where the domain's DNS is managed (Squarespace directly, or a
      registrar). If all-Squarespace, an Administrator contributor invite is
      enough for you to do the rest.
- [ ] Add the subdomain CNAME → Vercel (pick `shop.` or `order.`).
- [ ] Add Resend's domain-verification records (DKIM / SPF / DMARC) — ideally on
      a `send.` subdomain so it doesn't touch their normal email.
- [ ] Update `EMAIL_FROM` in Vercel to the verified sending domain.

**Supabase auth (needed for customer login, password reset & Google sign-in in production):**
- [ ] Set the **Site URL** to the production domain (Supabase → Authentication → URL Configuration).
- [ ] Add the production domain + `/auth/callback` to the **Redirect allowlist**
      — without this the password-reset link and the Google sign-in callback bounce.
- [ ] **Google OAuth:** provider enabled in Supabase, and the production domain +
      redirect URI added to the Google Cloud OAuth consent screen / credentials.
- [ ] **Auth emails:** confirm confirmation + password-reset emails actually send;
      ideally configure a custom SMTP (e.g. Resend) so they don't land in spam.

## 3. Catalog data (after deploy + one clean sync)

- [ ] Run one **clean full-store sync** (floral is now excluded at the source).
- [ ] Cleanup SQL:
  - [ ] `DELETE FROM products WHERE store_only = TRUE AND category = 'Household & Cleaning';` (removes already-imported floral)
  - [ ] `UPDATE products SET pkg_size = NULL WHERE pkg_size ~* 'zzz';` (junk pack sizes)
  - [ ] `SELECT category, COUNT(*) FROM products GROUP BY 1 ORDER BY 2 DESC;` → fix strays, e.g. `UPDATE products SET category = 'Frozen Foods' WHERE category = 'Frozen Goods';`
  - [ ] Clean leftover "(0.0000)" in names: `UPDATE products SET details = regexp_replace(details, '\s*\(0+(\.0+)?\)\s*$', '') WHERE details ~ '\(0+(\.0+)?\)\s*$';`
- [ ] Run **Find Photos** and apply the name-matched images (now paced + abbreviation-aware). The nightly sync also auto-applies high-confidence matches on its own.
- [ ] Align the invoice sequence to continue after QuickBooks:
      `ALTER SEQUENCE gts_invoice_seq RESTART WITH 1084;` (or your true next number).

## 4. Config & content

- [ ] Enter the real **delivery rate cards** (Deliveries → Rate Cards) once Jen
      sends her per-barge-line breakdown (e.g. Ingram $225 day / $325 night).
- [ ] Fix the **17 unmatched order-form rows** (Blue Bell/Coffeemate shared UPCs).
- [ ] **Delete the test/practice orders** so they don't pollute reports (Jen flagged this).
- [ ] Dave's butcher/deli **photos** against the shot list — ongoing, not a launch blocker.

## 5. Verify & dress-rehearse (the real de-risk for a public launch)

- [ ] Barcode register scan — **already tested & working** ✓
- [ ] Confirm catalog **search** is smooth (Jen hit a single-letter/backspace bug earlier).
- [ ] **One full end-to-end dress rehearsal:** place a real order → shopping mode →
      pick sheet at the register → enter register total → send final email (with
      delivery fee + Sinclair's receipt attached) → view the invoice → generate the
      billing packet. This is where you catch the last issues before real customers do.

---

## Post-launch (deliberately deferred)

- QuickBooks: CSV invoice export + customer/item mapping (after the Mary Karen call), then evaluate the full QBO API.
- Web-sourced product descriptions; allergen / USDA filtering.
- Auto-log a delivery in the ledger when the final email sends (connect the two).
