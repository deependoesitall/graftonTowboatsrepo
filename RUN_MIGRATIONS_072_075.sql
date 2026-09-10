-- ============================================================================
-- RUN_MIGRATIONS_072_075.sql
--
-- Migrations 072, 073, 074 and 075, concatenated in order, wrapped in a single
-- transaction. 071 is already run and is NOT included.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file ->
--   Run. It is all-or-nothing: if any statement fails, nothing is applied and
--   you can fix and re-run.
--
-- Every statement is idempotent (IF NOT EXISTS / guarded UPDATEs), so running
-- this twice is safe.
--
-- After it succeeds, run the VERIFY block at the bottom of this file as a
-- SEPARATE query.
-- ============================================================================

BEGIN;


-- ===========================================================================
-- 072_delivery_po_and_helper.sql
-- ===========================================================================

-- 072_delivery_po_and_helper.sql
--
-- Four fields the ledger form asks for and the table couldn't store.
--
-- ── po_number ────────────────────────────────────────────────────────────
-- `orders` has had one since migration 001, but `deliveries` never did — so a
-- PO given over the phone had nowhere to live and ended up typed into the
-- issues/comments box, where the billing packet can't find it. Ingram's
-- accounts payable want the PO on the invoice; digging it out of a free-text
-- notes field is how it gets missed.
--
-- ── helper_* ─────────────────────────────────────────────────────────────
-- Some runs take two people. Until now the second person's hours and pay were
-- either folded into the driver's numbers — quietly overstating one person's
-- hours in the only record of who worked when — or written in the comments.
--
-- Nullable and unconstrained on purpose: this is a log of what happened, not a
-- form to be satisfied. Most deliveries have no helper and no PO, and neither
-- absence is an error.

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS po_number    text,
  ADD COLUMN IF NOT EXISTS helper_name  text,
  ADD COLUMN IF NOT EXISTS helper_hours numeric(6,2),
  ADD COLUMN IF NOT EXISTS helper_pay   numeric(10,2);

COMMENT ON COLUMN deliveries.po_number IS
  'Customer PO for this delivery. Separate from orders.po_number — a phone delivery has no order row. Carried onto the billing packet.';
COMMENT ON COLUMN deliveries.helper_name IS
  'Second crew member on the run, if any. Their hours/pay are helper_hours and helper_pay, kept apart from the driver''s.';

-- Rows with a PO are the ones AP will query, so make them findable.
CREATE INDEX IF NOT EXISTS idx_deliveries_po
  ON deliveries (po_number) WHERE po_number IS NOT NULL;

-- Check:
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'deliveries'
--    AND column_name IN ('po_number','helper_name','helper_hours','helper_pay');
-- -- expect 4 rows


-- ===========================================================================
-- 073_push_subscriptions.sql
-- ===========================================================================

-- 073_push_subscriptions.sql
--
-- Web Push subscriptions for STAFF ONLY.
--
-- Email already tells GTS and Sinclair's about a new order and is not going
-- away. Push exists because email is slow to notice — a phone buzzing at 5am
-- gets a boat shopped sooner than a Gmail tab someone opens at eight.
--
-- ⚠️ NO CUSTOMER SUBSCRIPTIONS, EVER. Rows here are keyed to an admin session
-- subject (admin_users.id). There is no route that will write a row without a
-- verified admin session, and there is no code path that sends to a vessel.
-- A crew member on a barge should never get a push from us.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who this belongs to. Deliberately NOT a foreign key to admin_users: the
  -- push routes trust the signed session's `sub` claim, and a FK here would
  -- turn "the token names a user who was since deleted" into a 500 during a
  -- subscribe call rather than a row that simply stops being sent to.
  admin_user_id uuid NOT NULL,

  -- Snapshot of the role AT SUBSCRIBE TIME, used for fan-out targeting.
  -- Denormalised on purpose: sending is a hot path that runs inside the order
  -- POST, and it must not need a join to decide who gets what.
  -- Refreshed on every re-subscribe, which browsers do periodically.
  role          text NOT NULL,

  -- True for accounts scoped to Sinclair's (isSinclairScoped). Stored rather
  -- than derived so the send path can filter without importing auth logic.
  is_sinclair   boolean NOT NULL DEFAULT false,

  -- The push service URL. Globally unique per browser install — this is the
  -- natural key and the reason re-subscribing is an upsert, not an insert.
  -- Without the constraint, every app launch would add a duplicate row and
  -- staff would get the same notification four times.
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,

  -- Helps a human recognise their own devices in Settings ("iPhone", "Chrome
  -- on Windows") when they want to turn one off.
  user_agent    text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  last_sent_at  timestamptz,

  -- Set when the push service returns 404/410 (uninstalled, permission
  -- revoked, expired). Kept rather than deleted so a device that goes quiet is
  -- visibly dead instead of mysteriously absent.
  expired_at    timestamptz
);

-- The fan-out query: live subscriptions for a given audience.
CREATE INDEX IF NOT EXISTS idx_push_subs_live
  ON push_subscriptions (is_sinclair) WHERE expired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_push_subs_user
  ON push_subscriptions (admin_user_id);

-- Service-role only. The anon key must never read these: an endpoint URL is a
-- capability — anyone holding it plus the VAPID keys can push to that device.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subs_service_all ON push_subscriptions;
CREATE POLICY push_subs_service_all ON push_subscriptions
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

COMMENT ON TABLE push_subscriptions IS
  'Web Push endpoints for admin/shopper devices. Staff only — never customers. See migration 073.';

-- Check:
-- SELECT role, is_sinclair, count(*) FROM push_subscriptions
--  WHERE expired_at IS NULL GROUP BY 1,2;


-- ===========================================================================
-- 074_quickbooks_handoff.sql
-- ===========================================================================

-- 074_quickbooks_handoff.sql
--
-- Everything the QuickBooks pack needs that the ledger couldn't express.
--
-- ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────
--
-- QuickBooks Online Plus is the system of record. We never create an invoice,
-- an invoice number, or an email to AP. What we do is remove the part Mary
-- Karen currently does by hand: opening the Google Sheet, finding the fee,
-- finding the grocery total, and remembering which of the two gets sales tax.
--
-- That last one is the whole reason this migration exists. `bill_for_groceries`
-- was a boolean, and a boolean cannot tell the difference between:
--
--   · SINCLAIR COURTESY — GTS fronts a Sinclair's grocery bill and passes it
--     through at cost. The register total ALREADY CONTAINS SINCLAIR'S SALES
--     TAX. If QBO taxes that line again, the barge line is charged tax twice
--     and GTS remits tax it never collected.
--
--   · GTS PURCHASED — GTS bought something separately on its own exemption
--     (Ruler Foods, Walmart, ice melt, a fridge, lumber). No tax has been paid
--     yet, so QBO SHOULD tax it.
--
-- Both used to be "bill_for_groceries = true". Getting it wrong is a tax
-- error, not a cosmetic one, which is why it becomes an explicit three-way
-- choice rather than something inferred at invoice time.

-- ── grocery_mode ─────────────────────────────────────────────────────────
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS grocery_mode text
    NOT NULL DEFAULT 'none'
    CHECK (grocery_mode IN ('none', 'sinclair_courtesy', 'gts_purchased'));

COMMENT ON COLUMN deliveries.grocery_mode IS
  'none | sinclair_courtesy (register total already includes Sinclair tax — QBO must NOT tax it) | gts_purchased (bought on GTS exemption — QBO SHOULD tax it). See migration 074.';

-- Backfill from the boolean it replaces. Every existing true becomes
-- sinclair_courtesy, which is what it always meant in practice — GTS was
-- passing through a Sinclair's register total. Nothing historic was a
-- separately-purchased taxable buy; those were typed into comments.
UPDATE deliveries
   SET grocery_mode = 'sinclair_courtesy'
 WHERE bill_for_groceries IS TRUE
   AND grocery_mode = 'none';

-- ⚠️ bill_for_groceries IS NOW DERIVED, NOT AUTHORITATIVE. It stays because
-- the ledger UI and the older handoff still read it. New code must read
-- grocery_mode. This trigger keeps the old column honest so nothing that
-- hasn't been migrated yet starts quietly disagreeing with the new one.
CREATE OR REPLACE FUNCTION sync_bill_for_groceries()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.bill_for_groceries := (NEW.grocery_mode <> 'none');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bill_for_groceries ON deliveries;
CREATE TRIGGER trg_sync_bill_for_groceries
  BEFORE INSERT OR UPDATE OF grocery_mode ON deliveries
  FOR EACH ROW EXECUTE FUNCTION sync_bill_for_groceries();


-- ── side_purchases ───────────────────────────────────────────────────────
-- Taxable items GTS bought separately. Free-form on purpose: this is "two bags
-- of ice melt from Walmart, $23.80", not a catalogue. Each entry is
-- {description, amount} and each becomes its own TAXABLE line in QBO.
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS side_purchases jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN deliveries.side_purchases IS
  'Array of {description, amount} — items GTS bought on its own exemption. These ARE taxable in QBO, unlike Sinclair courtesy. See migration 074.';


-- ── Two independent "done in QuickBooks" flags ───────────────────────────
--
-- DELIBERATELY SEPARATE. `updated_quickbooks` conflated "I invoiced the barge
-- line" with "I paid the driver" — two different transactions, entered on
-- different days, often by different people. One flag meant marking a row done
-- for one of them hid it from the queue for the other.
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS customer_invoiced_in_qb boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_invoiced_at    timestamptz,
  ADD COLUMN IF NOT EXISTS driver_paid_in_qb       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_paid_at          timestamptz;

-- The old flag was used for customer invoicing, so that's where it lands.
UPDATE deliveries
   SET customer_invoiced_in_qb = true,
       customer_invoiced_at    = COALESCE(invoice_sent::timestamptz, updated_at)
 WHERE updated_quickbooks IS TRUE
   AND customer_invoiced_in_qb IS FALSE;


-- ── Not billable ─────────────────────────────────────────────────────────
-- Training runs, helper-only rows, waived fees. These are real deliveries that
-- must stay in the ledger for the record but must never sit in Mary's queue
-- looking like unfinished work.
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS not_billable        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS not_billable_reason text;


-- ── Which customers demand a signed slip ─────────────────────────────────
--
-- Ingram will not pay without one. Reliant, ARTCO and Kirby do not ask.
-- Treating "slip missing" as an error on every row trained everyone to ignore
-- the warning, which is how it gets missed on the one customer that cares.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS requires_signed_receipt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN companies.requires_signed_receipt IS
  'True when this barge line will not pay an invoice without a photographed signed delivery log. Drives the "need slip" warning on the QuickBooks pack.';

-- Ingram is the known case. Matching on name because company ids differ per
-- environment; safe to re-run and a no-op if the name never matches.
UPDATE companies
   SET requires_signed_receipt = true
 WHERE requires_signed_receipt IS FALSE
   AND name ILIKE '%ingram%';


-- ── The queue's index ────────────────────────────────────────────────────
-- Mary's screen is "not yet invoiced, not written off, newest first". Partial
-- so it stays small as years of invoiced rows accumulate behind it.
CREATE INDEX IF NOT EXISTS idx_deliveries_qb_queue
  ON deliveries (delivery_date DESC)
  WHERE customer_invoiced_in_qb IS FALSE AND not_billable IS FALSE;


-- ── Verify ───────────────────────────────────────────────────────────────
-- SELECT grocery_mode, count(*) FROM deliveries GROUP BY 1;
--
-- Should equal the old boolean exactly:
-- SELECT count(*) FROM deliveries
--  WHERE bill_for_groceries <> (grocery_mode <> 'none');   -- expect 0
--
-- The queue Mary will actually see:
-- SELECT count(*) FROM deliveries
--  WHERE customer_invoiced_in_qb IS FALSE AND not_billable IS FALSE;


-- ===========================================================================
-- 075_catalog_rails.sql
-- ===========================================================================

-- 075_catalog_rails.sql
--
-- The two homepage rails: "What's on sale" and "Best sellers".
--
-- These mirror what Sinclair's own storefront shows, so a captain browsing our
-- catalogue sees the same specials the store is running — same spirit as the
-- weekly ad, which crews already use.
--
-- ── WHY A TABLE AND NOT A LIVE FETCH ─────────────────────────────────────
--
-- Calling Freshop when someone opens /catalog would put a third-party API on
-- the critical path of the page crews order from, on a boat with one bar of
-- signal. Freshop also throttles (see isFreshopThrottled in freshop-sync).
-- A nightly job writes these rows; the page reads its own database.
--
-- ── WHY IT'S OVERWRITTEN WHOLE, NOT MERGED ───────────────────────────────
--
-- A sale that ended must DISAPPEAR. Merging would leave last week's expired
-- specials on the rail with a red price that no longer rings up — which is
-- worse than showing nothing, because the crew orders expecting the old price
-- and the register says otherwise. Each run deletes the rail and rewrites it.
--
-- ⚠️ NO COUPONS HERE. This is not the clip-to-save digital coupon system and
-- must not become it. Clip/loyalty offers require a Sinclair login the vessel
-- doesn't have, so an item priced with one would ring up higher at the
-- register. Those are filtered out before anything reaches this table.

CREATE TABLE IF NOT EXISTS catalog_rails (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  rail        text NOT NULL CHECK (rail IN ('best_sellers', 'on_sale')),

  -- Our product, not Freshop's. An item we can't resolve to a SKU is skipped
  -- at build time rather than stored and filtered later — a rail card that
  -- can't be added to a cart is just a tease.
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Freshop's order, preserved. Best sellers arrive ranked by popularity and
  -- that ranking is the whole value; re-sorting alphabetically would throw
  -- away the only signal the rail carries.
  position    integer NOT NULL,

  -- PRICE SNAPSHOT, DISPLAY ONLY.
  -- products.price moves on its own nightly sync and the two runs can disagree
  -- for a few minutes. Storing what we advertised keeps the struck-through
  -- regular and the red sale price consistent with each other on the card.
  --
  -- ⚠️ NEITHER IS AUTHORITATIVE. The Sinclair's register total is what gets
  -- billed — that's in the Terms and it stays true. These are estimates on a
  -- card, exactly like every other price in the catalogue.
  sale_price     numeric(10,2),
  regular_price  numeric(10,2),

  refreshed_at   timestamptz NOT NULL DEFAULT now(),

  -- One appearance per product per rail. Freshop returns the same item under
  -- several circulars during overlapping promotions.
  UNIQUE (rail, product_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_rails_read
  ON catalog_rails (rail, position);

-- Public read: these are shop-window prices on a page anyone browsing the
-- catalogue already sees. Writes are service-role only (the nightly job).
ALTER TABLE catalog_rails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_rails_public_read ON catalog_rails;
CREATE POLICY catalog_rails_public_read ON catalog_rails
  FOR SELECT USING (true);

DROP POLICY IF EXISTS catalog_rails_service_all ON catalog_rails;
CREATE POLICY catalog_rails_service_all ON catalog_rails
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

COMMENT ON TABLE catalog_rails IS
  'Nightly snapshot of Sinclair''s featured and on-sale items, resolved to our SKUs. Overwritten whole each run so ended sales vanish. Never contains clip/loyalty coupon offers. See migration 075.';

-- ── Kill switches ────────────────────────────────────────────────────────
--
-- One per rail, so either can be turned off without the other. Both GTS and
-- Sinclair's managers can flip them — Dave's side owns whether their pricing
-- is advertised on someone else's storefront, and GTS owns what its customers
-- see. Either party being able to switch it off alone is the right default for
-- a shared shop window.
--
-- Same pattern as show_digital_coupons, which already works this way.
--
-- Default TRUE: the rails are the point of the feature. An admin turning one
-- off is a deliberate act; a column defaulting to false would mean the feature
-- ships invisible and someone spends an afternoon working out why.
ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS show_sale_rail         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_best_sellers_rail boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN admin_settings.show_sale_rail IS
  'Shows the "What''s on sale" rail on /catalog. Editable by GTS and Sinclair''s managers.';
COMMENT ON COLUMN admin_settings.show_best_sellers_rail IS
  'Shows the "Best sellers" rail on /catalog. Editable by GTS and Sinclair''s managers.';

-- Check after the first cron run:
-- SELECT rail, count(*), max(refreshed_at) FROM catalog_rails GROUP BY 1;
-- SELECT show_sale_rail, show_best_sellers_rail FROM admin_settings;


COMMIT;

-- ============================================================================
-- VERIFY — run this separately AFTER the transaction above commits.
-- Expected results are on each line.
-- ============================================================================
--
-- 072 — expect 4 rows
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'deliveries'
--    AND column_name IN ('po_number','helper_name','helper_hours','helper_pay');
--
-- 073 — expect the table to exist and RLS to be on (rowsecurity = true)
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'push_subscriptions';
--
-- 074 — expect 0 (old boolean and new enum agree on every row)
-- SELECT count(*) FROM deliveries
--  WHERE bill_for_groceries <> (grocery_mode <> 'none');
--
-- 074 — expect at least one row for Ingram
-- SELECT name, requires_signed_receipt FROM companies WHERE requires_signed_receipt;
--
-- 075 — expect one row, both true
-- SELECT show_sale_rail, show_best_sellers_rail FROM admin_settings;
--
-- 075 — expect 0 rows until the nightly cron has run once
-- SELECT rail, count(*), max(refreshed_at) FROM catalog_rails GROUP BY 1;
