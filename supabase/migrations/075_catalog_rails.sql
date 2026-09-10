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
