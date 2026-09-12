-- Migration 080: expire stale sale prices (one-shot repair + reusable RPC)
--
-- Symptom: products keep expired sale prices until a Freshop sync re-touches
-- them. e.g. price=2.50, regular_price=3.65, sale_finish_date=2026-09-08 still
-- charging the sale on 2026-09-12 because read paths trusted products.price
-- and "regular_price IS NOT NULL" without checking the finish date.
--
-- Calendar day is America/Chicago (Sinclair's ad turnover), not UTC.

-- One-shot repair for every row whose sale window has ended.
UPDATE products
SET
  price            = COALESCE(regular_price, price),
  regular_price    = NULL,
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
  UPDATE products
  SET
    price            = COALESCE(regular_price, price),
    regular_price    = NULL,
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
