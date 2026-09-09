-- DISABLE_HOT_ITEMS.sql
--
-- ANSWERED — Sept 2026. Sinclair's data DOES identify hot food, and the signal
-- is the sub-department, not the location or the name.
--
--   sub_category = 'Hot Food And Prepared'
--
-- Two things that look like better signals and are not:
--
--   · LOCATION LIES. Every hot item reads "Cold Deli" — the hot case sits in
--     the same walkpath zone as the cold case.
--   · NAMES ARE WORSE. Searching descriptions for "fried" returned refried
--     beans, French fried onions, "Baked Not Fried" crisps, frozen dinners and
--     fried-pickle-flavoured chips. Dozens of shelf-stable items a boat can
--     order perfectly well. Keyword matching would have quietly removed them.
--
-- The nightly sync now SKIPS these at insert (isHotFood in freshop-sync.ts), so
-- new hot items Sinclair's adds will never appear. This file deals with the
-- ones already in the table.

-- ══════════════════════════════════════════════════════════════════════════
-- STEP 1 — See exactly what will be turned off. Run this first.
-- ══════════════════════════════════════════════════════════════════════════
SELECT description, category, sub_category, location, price, uom,
       is_active, is_available
FROM products
WHERE sub_category = 'Hot Food And Prepared'
ORDER BY description;

-- Count, so the UPDATE below has an expected number to match:
SELECT count(*) AS will_be_disabled
FROM products
WHERE sub_category = 'Hot Food And Prepared' AND is_active;


-- ══════════════════════════════════════════════════════════════════════════
-- STEP 2 — Disable them.
--
-- is_active = false, NOT delete:
--   · a deleted row is just re-inserted by the next sweep
--   · disabled rows stay findable in admin substitution search, which is where
--     Dave might legitimately need to look one up
--
-- This STICKS. The sync sets is_active only on INSERT; the update path never
-- touches it. Tomorrow's sweep will not serve these back to the boats.
-- ══════════════════════════════════════════════════════════════════════════
UPDATE products
   SET is_active = false
 WHERE sub_category = 'Hot Food And Prepared'
   AND is_active;


-- ══════════════════════════════════════════════════════════════════════════
-- STEP 3 — The stragglers. ⚠️ NEEDS A HUMAN, DON'T AUTOMATE THIS.
--
-- A handful of hot items are sitting in a junk bucket: sub_category 'P',
-- location 'Dairy'. Spotted in the audit:
--
--     2 PC CHICKEN TENDER SNACK
--     FTF 12PC TENDER MEAL 2 LG SIDES 6 BISCUITS
--
-- That same bucket also holds perfectly good stock — refried beans, frozen
-- meals, pork skins — so it CANNOT be blanket-disabled. Read the list and pick.
-- ══════════════════════════════════════════════════════════════════════════
SELECT description, price, uom, is_active
FROM products
WHERE sub_category = 'P'
  AND location = 'Dairy'
  AND is_active
ORDER BY description;

-- Then disable individually once you've read them:
-- UPDATE products SET is_active = false
--  WHERE description IN (
--    '2 PC CHICKEN TENDER SNACK',
--    'FTF 12PC TENDER MEAL 2 LG SIDES 6 BISCUITS'
--  );


-- ══════════════════════════════════════════════════════════════════════════
-- STEP 4 — Confirm nothing hot is still orderable.
-- ══════════════════════════════════════════════════════════════════════════
-- SELECT count(*) AS still_live
--   FROM products
--  WHERE sub_category = 'Hot Food And Prepared'
--    AND is_active AND is_available;
-- -- expect 0
