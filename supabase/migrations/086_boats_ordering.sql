-- 086: "Boats are currently ordering" — our own frequency rail.
--
-- Best sellers / also-bought stay Sinclair's popularity. This ranking is
-- DISTINCT grocery orders per catalog SKU over 90 days, so one stocking-up
-- barge cannot own the row. Public rail stays OFF until an admin flips
-- show_boats_ordering_rail (and the catalog still hides it under 8 cards).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS purchased_at DATE,
  ADD COLUMN IF NOT EXISTS source TEXT;

UPDATE orders
   SET purchased_at = (created_at AT TIME ZONE 'America/Chicago')::date
 WHERE purchased_at IS NULL;

UPDATE orders
   SET source = CASE
         WHEN order_number LIKE 'IMP-%' THEN 'register_import'
         ELSE 'catalog'
       END
 WHERE source IS NULL;

ALTER TABLE orders
  ALTER COLUMN purchased_at SET DEFAULT ((timezone('America/Chicago', now()))::date);

COMMENT ON COLUMN orders.purchased_at IS
  'Calendar date the groceries were bought (Chicago). Live orders = placed day; register imports = receipt date when known.';
COMMENT ON COLUMN orders.source IS
  'catalog | staff | register_import. Ranking and admin preview use this to explain the row.';

CREATE INDEX IF NOT EXISTS idx_orders_purchased_at ON orders (purchased_at);

CREATE INDEX IF NOT EXISTS idx_order_items_boats_ordering
  ON order_items (product_id, order_id)
  WHERE product_id IS NOT NULL AND item_type = 'grocery';

-- Allow the third rail value.
ALTER TABLE catalog_rails DROP CONSTRAINT IF EXISTS catalog_rails_rail_check;
ALTER TABLE catalog_rails
  ADD CONSTRAINT catalog_rails_rail_check
  CHECK (rail IN ('best_sellers', 'on_sale', 'boats_ordering'));

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS show_boats_ordering_rail BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN admin_settings.show_boats_ordering_rail IS
  'Shows "Boats are currently ordering" on /catalog. Default off — silent collection until we have enough grocery orders.';

CREATE OR REPLACE FUNCTION boats_ordering_rank(p_days integer DEFAULT 90, p_limit integer DEFAULT 24)
RETURNS TABLE(product_id uuid, order_count bigint, last_purchased date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    oi.product_id,
    count(DISTINCT oi.order_id)::bigint AS order_count,
    max(coalesce(o.purchased_at, (o.created_at AT TIME ZONE 'America/Chicago')::date)) AS last_purchased
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN products p ON p.id = oi.product_id
  WHERE oi.product_id IS NOT NULL
    AND oi.item_type = 'grocery'
    AND coalesce(oi.paid_by, 'vessel') = 'vessel'
    AND o.status IS DISTINCT FROM 'cancelled'
    AND coalesce(o.purchased_at, (o.created_at AT TIME ZONE 'America/Chicago')::date)
        >= ((timezone('America/Chicago', now()))::date - p_days)
    AND p.is_active IS TRUE
    AND p.is_available IS TRUE
    AND (p.sub_category IS NULL OR p.sub_category NOT ILIKE 'Hot Food%')
  GROUP BY oi.product_id
  ORDER BY count(DISTINCT oi.order_id) DESC, max(coalesce(o.purchased_at, (o.created_at AT TIME ZONE 'America/Chicago')::date)) DESC
  LIMIT GREATEST(COALESCE(p_limit, 24), 1);
$$;

CREATE OR REPLACE FUNCTION boats_ordering_stats(p_days integer DEFAULT 90)
RETURNS TABLE(
  grocery_orders bigint,
  distinct_boats bigint,
  matched_lines bigint,
  distinct_skus bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH grocery AS (
    SELECT oi.order_id, oi.product_id, o.vessel_id, o.vessel_name
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
      AND oi.item_type = 'grocery'
      AND coalesce(oi.paid_by, 'vessel') = 'vessel'
      AND o.status IS DISTINCT FROM 'cancelled'
      AND coalesce(o.purchased_at, (o.created_at AT TIME ZONE 'America/Chicago')::date)
          >= ((timezone('America/Chicago', now()))::date - p_days)
  )
  SELECT
    (SELECT count(DISTINCT order_id) FROM grocery),
    (SELECT count(DISTINCT coalesce(vessel_id::text, lower(btrim(coalesce(vessel_name, '')))))
       FROM grocery WHERE coalesce(btrim(vessel_name), '') <> '' OR vessel_id IS NOT NULL),
    (SELECT count(*) FROM grocery),
    (SELECT count(DISTINCT product_id) FROM grocery);
$$;

REVOKE ALL ON FUNCTION boats_ordering_rank(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION boats_ordering_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION boats_ordering_rank(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION boats_ordering_stats(integer) TO service_role;
