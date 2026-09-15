-- 087: co-occurrence for "boats who ordered this also ordered".
--
-- Same grocery filters as 086 (vessel-paid, 90-day purchased_at, no hot food,
-- no cancelled). Counts DISTINCT orders that contained both SKUs — one
-- stocking-up barge cannot own the row.

CREATE OR REPLACE FUNCTION boats_also_bought(
  p_product_id uuid,
  p_days integer DEFAULT 90,
  p_limit integer DEFAULT 8
)
RETURNS TABLE(product_id uuid, order_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    other.product_id,
    count(DISTINCT other.order_id)::bigint AS order_count
  FROM order_items seed
  JOIN orders o ON o.id = seed.order_id
  JOIN order_items other
    ON other.order_id = seed.order_id
   AND other.product_id IS NOT NULL
   AND other.product_id IS DISTINCT FROM seed.product_id
   AND other.item_type = 'grocery'
   AND coalesce(other.paid_by, 'vessel') = 'vessel'
  JOIN products p ON p.id = other.product_id
  WHERE seed.product_id = p_product_id
    AND seed.item_type = 'grocery'
    AND coalesce(seed.paid_by, 'vessel') = 'vessel'
    AND o.status IS DISTINCT FROM 'cancelled'
    AND coalesce(o.purchased_at, (o.created_at AT TIME ZONE 'America/Chicago')::date)
        >= ((timezone('America/Chicago', now()))::date - p_days)
    AND p.is_active IS TRUE
    AND p.is_available IS TRUE
    AND (p.sub_category IS NULL OR p.sub_category NOT ILIKE 'Hot Food%')
  GROUP BY other.product_id
  ORDER BY count(DISTINCT other.order_id) DESC
  LIMIT GREATEST(COALESCE(p_limit, 8), 1);
$$;

REVOKE ALL ON FUNCTION boats_also_bought(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION boats_also_bought(uuid, integer, integer) TO service_role;
