-- RESYNC_STORE_CATEGORIES.sql
--
-- ⚠ OPTIONAL, AND LOWER VALUE THAN IT LOOKS. Safe to delete this file.
--
-- WHAT CHANGED (Sept 6): the original version of this script existed to move
-- ~1,000 household and health items out of Pantry & Grocery. That is NOT
-- happening — Deepen's call, and the right one: our categories mirror
-- Sinclair's, because Dave, Gloria and the cooks already know where things sit
-- on their site. Sinclair's files bleach and detergent under Pantry, so we do
-- too. Consistency with the store beats being neater than the store.
--
-- WHAT'S LEFT: the only thing a re-sync now fixes is ~3,500 rows whose
-- sub_category is the literal "P" (a URL marker the old parser mistook for a
-- category), plus a handful carrying a whole product name. That column is
-- ADMIN-ONLY — customers never see it — so this is cosmetic tidying of the
-- Products table, not a customer-facing fix.
--
-- The parser is fixed either way, so every item imported from here on is
-- clean. This script only back-fills the 10,900 already in the table.
--
-- TIMING: if you ever want it done, it has to be before boats start ordering.
-- store_only rows have nothing referencing them today; once a customer orders
-- one, order_items.product_id points at it and the wipe stops being safe.
-- Step 1 refuses to run if that's already true.
--
-- Cost: ~9 sync runs to rebuild. Benefit: a tidier admin column. Your call.

-- ── 1. SAFETY CHECK — must return 0 ────────────────────────────────
SELECT count(DISTINCT oi.product_id) AS store_items_on_orders
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
 WHERE p.store_only = true;


-- ── 2. HOW MUCH JUNK IS THERE? ─────────────────────────────────────
-- If this number doesn't bother you, stop here and delete this file.
SELECT count(*) AS junk_sub_categories
  FROM products
 WHERE store_only = true
   AND (sub_category = 'P' OR length(sub_category) > 28);


-- ── 3. WIPE + RESET (only if you decided it's worth it) ────────────
-- Aborts itself if any store item appears on a real order.
-- Barge items (store_only = false) are never touched.
DO $$
DECLARE referenced int;
BEGIN
  SELECT count(DISTINCT oi.product_id) INTO referenced
    FROM order_items oi JOIN products p ON p.id = oi.product_id
   WHERE p.store_only = true;

  IF referenced > 0 THEN
    RAISE EXCEPTION
      'ABORTED: % store item(s) appear on real orders. Deleting them would break order history.', referenced;
  END IF;

  DELETE FROM products WHERE store_only = true;
  RAISE NOTICE 'store mirror cleared — re-run the catalog sync to rebuild it';
END $$;

UPDATE catalog_sync_state SET state = '{}'::jsonb WHERE id = 1;

-- Then: deploy, and trigger the sync (admin → Products → "Sync now").
-- Expect ~123 pages and ~10,900 items again, roughly 9 runs.
-- Verify: SELECT count(*) FROM products
--          WHERE store_only = true AND (sub_category = 'P' OR length(sub_category) > 28);
--         should be 0.
