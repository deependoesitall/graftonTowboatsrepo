-- Remove orders that saved with ZERO items.
--
-- Cause: order_items were inserted as one bulk batch whose rows had different
-- key sets (grocery rows carry location/paid_by/cod_name, service rows don't).
-- PostgREST rejects a mixed-key batch outright, and the result was never
-- checked — so any order combining groceries with a parts pickup, package
-- delivery or outside pickup saved with no items, emailed a confirmation, and
-- showed "0 items" beside a correct dollar total.
--
-- Fixed in the API (keys normalised + the insert now fails loudly and rolls the
-- order back). This only cleans up the rows already written.

-- ── 1. LOOK FIRST. These are the empty orders. ──────────────────────────────
SELECT o.order_number,
       o.company_name,
       o.vessel_name,
       o.subtotal,
       o.status,
       o.created_at
  FROM orders o
 WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)
 ORDER BY o.created_at DESC;

-- Sanity check — how many, and are any of them NOT test orders?
SELECT count(*) AS empty_orders,
       min(created_at) AS oldest,
       max(created_at) AS newest
  FROM orders o
 WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id);

-- ── 2. DELETE. Run only after reading the list above. ───────────────────────
-- An order with no items cannot be shopped, invoiced or fulfilled — there is
-- nothing to recover. Child rows go first so nothing is orphaned.

-- DELETE FROM order_discounts
--  WHERE order_id IN (SELECT o.id FROM orders o
--                      WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id));

-- DELETE FROM orders o
--  WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id);

-- ── Or delete a single known one instead: ───────────────────────────────────
-- DELETE FROM order_discounts WHERE order_id = (SELECT id FROM orders WHERE order_number = 'GTS-260821-4578');
-- DELETE FROM orders WHERE order_number = 'GTS-260821-4578';

-- ── 3. Confirm none remain ─────────────────────────────────────────────────
-- SELECT count(*) AS empty_orders_remaining
--   FROM orders o
--  WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id);
