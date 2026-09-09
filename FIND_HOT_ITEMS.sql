-- FIND_HOT_ITEMS.sql
--
-- Hot, ready-to-eat items shouldn't be orderable — a boat can't take a hot
-- chicken tender meal delivered by van an hour later. The question is whether
-- Sinclair's data already tells us which items those are, or whether Dave has
-- to hand over a list.
--
-- STRONG REASON TO THINK IT DOES.
-- Sinclair's real walkpath (migration 063) names one of its departments
-- "COLD DELI". Nobody calls a department "Cold Deli" unless there is a hot one
-- to distinguish it from. The sync already captures that value into
-- products.location, from Freshop's shopper_location / fulfillment_walkpath.
--
-- Run STEP 1 first. It answers the question in about two seconds.
--
-- ══════════════════════════════════════════════════════════════════════════
-- STEP 1 — What location values actually exist, and how big is each?
-- ══════════════════════════════════════════════════════════════════════════
SELECT
  coalesce(location, '(none)') AS location,
  count(*)                     AS items,
  count(*) FILTER (WHERE is_active AND is_available) AS live_now
FROM products
GROUP BY 1
ORDER BY items DESC;

-- WHAT TO LOOK FOR: anything reading "Hot Deli", "Hot Case", "Hot Foods",
-- "Deli Hot", "Chicken", "Fried", "Grab & Go". If one of those exists, the
-- problem is solved and you never need a list from Dave.


-- ══════════════════════════════════════════════════════════════════════════
-- STEP 2 — Where do the known hot items actually sit?
--
-- These are the ones from the catalogue screenshots. If they share a location,
-- that's your filter. If they're scattered across "Bakery" and "Cold Deli"
-- with nothing distinguishing them, the data doesn't know and you do need
-- Dave's list.
-- ══════════════════════════════════════════════════════════════════════════
SELECT description, category, sub_category, location, location_seq,
       is_active, is_available, price, uom
FROM products
WHERE description ILIKE ANY (ARRAY[
  '%tender meal%', '%tender snack%', '%chicken snack%', '%meat burrito%',
  '%pizza slice%', '%wedges%', '%jojo%', '%fried%', '%rotisserie%'
])
ORDER BY location NULLS LAST, description;


-- ══════════════════════════════════════════════════════════════════════════
-- STEP 3 — Disable them.  ⚠️ READ THIS BEFORE RUNNING ⚠️
--
-- GOOD NEWS ON DURABILITY: this sticks. The nightly Freshop sync only sets
-- is_active on INSERT (see buildRowFromFreshop in src/lib/freshop-sync.ts).
-- The update path touches details, image, price, sale dates, location and
-- weight flags — never is_active. So a hot item you switch off stays off, and
-- tomorrow's sweep will not quietly serve it back to the boats.
--
-- Use is_active = false, NOT deletion:
--   · a deleted row gets re-inserted by the next sweep, active again
--   · is_active = false keeps it available for admin substitution searches,
--     which is where Dave might legitimately need to find one
--
-- Pick whichever WHERE clause matches what Step 1 and 2 told you, then
-- uncomment and run.
-- ══════════════════════════════════════════════════════════════════════════

-- (a) If a hot location exists — the clean case:
-- UPDATE products
--    SET is_active = false
--  WHERE location ILIKE '%hot%'
--    AND is_active;

-- (b) If you have a list from Dave, by UPC — the most precise option:
-- UPDATE products
--    SET is_active = false
--  WHERE upc IN ('0000000000000', '0000000000001')   -- paste Dave's UPCs
--    AND is_active;

-- (c) By exact description, if the list comes as names:
-- UPDATE products
--    SET is_active = false
--  WHERE description IN (
--    '3 Pc Tender Meal',
--    '3 Piece Tender Snack',
--    '2 Piece Chicken Snack',
--    '3-Meat Burrito'
--  ) AND is_active;


-- ══════════════════════════════════════════════════════════════════════════
-- STEP 4 — Confirm, and keep a record of what you turned off.
-- ══════════════════════════════════════════════════════════════════════════
-- SELECT description, location, price, is_active
--   FROM products
--  WHERE NOT is_active AND store_only
--  ORDER BY location NULLS LAST, description;
