-- Migration 080: expire stale sale prices (one-shot repair + reusable RPC)
--
-- Symptom: products keep expired sale prices until a Freshop sync re-touches
-- them. e.g. price=2.50, regular_price=3.65, sale_finish_date=2026-09-08 still
-- charging the sale on 2026-09-12 because read paths trusted products.price
-- and "regular_price IS NOT NULL" without checking the finish date.
--
-- Calendar day is America/Chicago (Sinclair's ad turnover), not UTC.

-- One-shot repair. uniq_store_match_key forbids two store_only rows with the
-- same flattened name+size AND the same price. Snapping an expired sale back
-- to regular_price can collide (5 lb brussels at $2.49 already exists). Those
-- rows still get their sale WINDOW cleared so live pricing uses regular_price;
-- we just don't rewrite `price` when that would violate the unique index.

UPDATE products p
SET
  price            = COALESCE(p.regular_price, p.price),
  regular_price    = NULL,
  sale_start_date  = NULL,
  sale_finish_date = NULL
WHERE p.sale_finish_date IS NOT NULL
  AND p.sale_finish_date < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Chicago')::date
  AND NOT EXISTS (
    SELECT 1 FROM products o
    WHERE o.id <> p.id
      AND o.store_only IS TRUE
      AND p.store_only IS TRUE
      AND public.product_match_key(o.description, o.pkg_size)
        = public.product_match_key(p.description, p.pkg_size)
      AND o.price = COALESCE(p.regular_price, p.price)
  );

-- Collisions: drop the expired window, keep both listings.
UPDATE products
SET
  sale_start_date  = NULL,
  sale_finish_date = NULL
WHERE sale_finish_date IS NOT NULL
  AND sale_finish_date < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Chicago')::date;

-- Reusable sweep for nightly sync / cron — same rule, returns how many rows
-- were expired. Safe to call repeatedly (no-op when nothing is stale).
CREATE OR REPLACE FUNCTION expire_stale_product_sales()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE products p
  SET
    price            = COALESCE(p.regular_price, p.price),
    regular_price    = NULL,
    sale_start_date  = NULL,
    sale_finish_date = NULL
  WHERE p.sale_finish_date IS NOT NULL
    AND p.sale_finish_date < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Chicago')::date
    AND NOT EXISTS (
      SELECT 1 FROM products o
      WHERE o.id <> p.id
        AND o.store_only IS TRUE
        AND p.store_only IS TRUE
        AND public.product_match_key(o.description, o.pkg_size)
          = public.product_match_key(p.description, p.pkg_size)
        AND o.price = COALESCE(p.regular_price, p.price)
    );
  UPDATE products
  SET
    sale_start_date  = NULL,
    sale_finish_date = NULL
  WHERE sale_finish_date IS NOT NULL
    AND sale_finish_date < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Chicago')::date;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION expire_stale_product_sales() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION expire_stale_product_sales() TO service_role;

COMMENT ON FUNCTION expire_stale_product_sales() IS
  'Clears expired Freshop sale prices using America/Chicago calendar dates. Called from catalog-sync end-of-run and safe as a daily cron.';
