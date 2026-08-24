-- Migration 060: sale prices and ad validity dates
--
-- Dave, at the August demo, looking at his own Freshop sheet beside ours:
--   "on ours, it will actually show if there is a price reduction, how long
--    it's good for... That would be ideal."
--   "Ideally, on the pick sheet on the barcodes like this."
--
-- His sheet prints:  $8.53 (08/10/26 - 09/06/26)  $9.19 | 33.81 oz
--                    ^sale  ^valid range           ^regular
--
-- Freshop hands us all three per product:
--   base_price          0.79   ← regular shelf price
--   offer_sale_price    0.69   ← what it rings at today
--   sale_start_date / sale_finish_date
--
-- HOW price IS STORED. products.price stays the EFFECTIVE price — the sale
-- price while a sale runs, the regular price otherwise. Every existing
-- calculation (cart totals, estimates, invoices, the COD fee) keeps using
-- price and gets the right number with no changes. regular_price is populated
-- ONLY during a sale, so "regular_price IS NOT NULL" means "on sale right now"
-- and there's no second source of truth to drift.
--
-- These are advertised prices, not a promise: Sinclair's ad changes at midnight
-- Tuesday and the register is always final. The customer-facing wording says so.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS regular_price     NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS sale_start_date   DATE,
  ADD COLUMN IF NOT EXISTS sale_finish_date  DATE;

COMMENT ON COLUMN products.regular_price IS
  'Shelf price before the current sale. NULL = not on sale; price is the regular price.';
COMMENT ON COLUMN products.sale_finish_date IS
  'Last day the advertised sale price is valid. Sinclair''s ad changes midnight Tuesday.';

-- Finding what is on sale right now, for the catalog''s sale filter.
CREATE INDEX IF NOT EXISTS idx_products_on_sale
  ON products (sale_finish_date)
  WHERE regular_price IS NOT NULL;

-- Current state, for reference after the next sync.
SELECT count(*) FILTER (WHERE regular_price IS NOT NULL) AS on_sale,
       count(*)                                          AS total
  FROM products;

-- ── The enrich RPC must learn the new fields ─────────────────────────────────
-- apply_enrich_updates() enumerates every column it will write. The nightly
-- sync sends its updates through it, so a field the function doesn't name is
-- silently DISCARDED — the sync would report "prices updated" while the sale
-- columns never moved. Redefined here with the three sale fields added.
--
-- Note the ->> + NULLIF dance: jsonb ->> 'x' on a JSON null yields SQL NULL
-- already, which is what we want — an expired sale must be able to clear the
-- struck-through price back to nothing.
CREATE OR REPLACE FUNCTION apply_enrich_updates(items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE products p SET
    details             = CASE WHEN x.fields ? 'details'             THEN x.fields->>'details'                              ELSE p.details END,
    image_url           = CASE WHEN x.fields ? 'image_url'           THEN x.fields->>'image_url'                            ELSE p.image_url END,
    billed_by_weight    = CASE WHEN x.fields ? 'billed_by_weight'    THEN (x.fields->>'billed_by_weight')::boolean          ELSE p.billed_by_weight END,
    location            = CASE WHEN x.fields ? 'location'            THEN x.fields->>'location'                             ELSE p.location END,
    location_seq        = CASE WHEN x.fields ? 'location_seq'        THEN (x.fields->>'location_seq')::smallint             ELSE p.location_seq END,
    price               = CASE WHEN x.fields ? 'price'               THEN (x.fields->>'price')::numeric                     ELSE p.price END,
    quantity_step       = CASE WHEN x.fields ? 'quantity_step'       THEN (x.fields->>'quantity_step')::numeric             ELSE p.quantity_step END,
    quantity_label      = CASE WHEN x.fields ? 'quantity_label'      THEN x.fields->>'quantity_label'                       ELSE p.quantity_label END,
    quantity_size_ratio = CASE WHEN x.fields ? 'quantity_size_ratio' THEN (x.fields->>'quantity_size_ratio')::numeric       ELSE p.quantity_size_ratio END,
    freshop_id          = CASE WHEN x.fields ? 'freshop_id'          THEN x.fields->>'freshop_id'                           ELSE p.freshop_id END,
    regular_price       = CASE WHEN x.fields ? 'regular_price'       THEN (x.fields->>'regular_price')::numeric             ELSE p.regular_price END,
    sale_start_date     = CASE WHEN x.fields ? 'sale_start_date'     THEN (x.fields->>'sale_start_date')::date              ELSE p.sale_start_date END,
    sale_finish_date    = CASE WHEN x.fields ? 'sale_finish_date'    THEN (x.fields->>'sale_finish_date')::date             ELSE p.sale_finish_date END
  FROM jsonb_to_recordset(items) AS x(id uuid, fields jsonb)
  WHERE p.id = x.id;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

-- ── Snapshot the sale onto the ORDER LINE ────────────────────────────────────
-- order_items already snapshots unit_price, because what the customer was
-- quoted must not drift when the catalog changes. The struck-through price and
-- the ad end date have to travel with it for the same reason: an order placed
-- Monday and shopped Wednesday should show what the crew SAW, not what the
-- shelf says today. Sinclair's ad turns over midnight Tuesday, so this is the
-- normal case, not an edge case — and the register is always final either way.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS regular_price    NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS sale_finish_date DATE;

COMMENT ON COLUMN order_items.regular_price IS
  'Shelf price before the sale, as quoted to the customer. NULL = not on sale when ordered.';
