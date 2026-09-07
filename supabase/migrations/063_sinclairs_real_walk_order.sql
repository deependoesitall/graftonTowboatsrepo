-- 063_sinclairs_real_walk_order.sql
--
-- Point the stored fallback walk order at Sinclair's ACTUAL departments.
--
-- Migration 028 seeded a plausible-sounding default:
--     Produce · Bakery · Deli · Meat · Aisles · Dairy · Frozen
--
-- Three of those names don't exist in Sinclair's store. Theirs are
-- "Cold Deli", "Fresh Meat" and "Freezer Meat", so any group carrying those
-- labels missed the list entirely and fell through to the alphabetical
-- catch-all at the end of the walk.
--
-- Their real walkpath, read from the live catalog on Sept 6 (sequence 1 → 26):
--
--     1  Produce            9-13  Aisles 3b-5b      17-25  Aisles 6b-10b
--   2-6  Aisles 1a-3a         14  Fresh Meat           26  Dairy
--     7  Cold Deli            15  Frozen
--     8  Bakery               16  Freezer Meat
--
-- WORTH BEING CLEAR ABOUT WHAT THIS DOES AND DOESN'T DO.
--
-- It does NOT set the walk order. Every synced item carries `location_seq` —
-- Sinclair's own configured walkpath position — and that is the primary sort in
-- groupByWalkingOrder(). Shopping mode has always walked their real store.
--
-- This list is the FALLBACK for items with no sequence at all: something added
-- by hand, or a product the nightly sync hasn't matched yet. It was wrong, it
-- just wasn't wrong often enough to notice. Now it matches the store.
--
-- Note the named departments are interleaved with the aisles rather than
-- bookending them. A single "Aisles" token can't express that, which is fine —
-- location_seq handles the real ordering. This only has to be sensible.

UPDATE admin_settings
   SET store_zone_order = '["Produce","Cold Deli","Bakery","Aisles","Fresh Meat","Frozen","Freezer Meat","Dairy"]'::jsonb
 WHERE store_zone_order IS NULL
    OR store_zone_order = '["Produce","Bakery","Deli","Meat","Aisles","Dairy","Frozen"]'::jsonb;

-- Only rewrites the untouched default above. If someone has already customised
-- the order, their version is left exactly as it is.

-- Check:
-- SELECT store_zone_order FROM admin_settings;
