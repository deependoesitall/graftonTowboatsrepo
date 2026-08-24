-- LAUNCH CLEANUP — run in the Supabase SQL editor AFTER migrations 053/054/055.
-- Safe to run more than once. Read the counts each step prints before moving on.

-- ── 1. Floral that was imported before it was excluded at the source ─────────
-- Look first. If this number is large, stop and check the category mapping
-- before deleting anything.
SELECT count(*) AS floral_rows_to_delete
  FROM products WHERE store_only = TRUE AND category = 'Household & Cleaning';

DELETE FROM products
 WHERE store_only = TRUE AND category = 'Household & Cleaning';

-- ── 2. Junk pack sizes ("1.0000 zzz" is a Freshop placeholder) ───────────────
UPDATE products SET pkg_size = NULL WHERE pkg_size ~* 'zzz';

-- ── 3. Leftover "(0.0000)" in display names ─────────────────────────────────
UPDATE products
   SET details = regexp_replace(details, '\s*\(0+(\.0+)?\)\s*$', '')
 WHERE details ~ '\(0+(\.0+)?\)\s*$';

-- ── 4. Category strays ──────────────────────────────────────────────────────
UPDATE products SET category = 'Frozen Foods' WHERE category = 'Frozen Goods';
UPDATE products SET category = 'Dairy'        WHERE category = 'Dairy & Eggs';

-- Review what's left; anything unexpected here becomes a manual fix.
SELECT category, count(*) FROM products GROUP BY 1 ORDER BY 2 DESC;

-- ── 5. Collision-prone produce images ───────────────────────────────────────
-- Short UPCs (1-7 digits) are register PLUs, not real barcodes, so these
-- matched by coincidence. Clearing them lets the fixed department-scoped
-- matcher re-propose correctly.
UPDATE products
   SET image_url = NULL, image_source = NULL
 WHERE store_only = FALSE
   AND image_source = 'sinclair_sync'
   AND length(regexp_replace(coalesce(upc, ''), '\D', '', 'g')) BETWEEN 1 AND 7;

-- ── 6. Invoice numbering continues after QuickBooks ─────────────────────────
-- Confirm the true next number with Mary Karen before running this.
-- ALTER SEQUENCE gts_invoice_seq RESTART WITH 1084;

-- ── 7. Remove test/practice orders (Jen flagged these) ──────────────────────
-- LOOK BEFORE DELETING. Adjust the filter to match your actual test orders.
SELECT id, order_number, vessel_name, customer_name, total, created_at
  FROM orders
 ORDER BY created_at DESC
 LIMIT 40;

-- Then delete by explicit id list only — never by a broad predicate:
-- DELETE FROM order_items WHERE order_id IN ('<id>', '<id>');
-- DELETE FROM orders      WHERE id       IN ('<id>', '<id>');

-- ── 8. Post-sync health check ───────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE store_only)                                AS store_items,
  count(*) FILTER (WHERE store_only AND is_available)               AS store_visible,
  count(*) FILTER (WHERE store_only AND freshop_id IS NULL)         AS store_unreconcilable,
  count(*) FILTER (WHERE NOT store_only)                            AS barge_items,
  count(*) FILTER (WHERE NOT store_only AND image_url IS NULL)      AS barge_missing_photo,
  count(*) FILTER (WHERE proposed_image_url IS NOT NULL)            AS awaiting_photo_review
FROM products;
