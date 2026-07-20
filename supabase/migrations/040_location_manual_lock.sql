-- 040_location_manual_lock.sql
-- Manual aisle-location corrections must SURVIVE the nightly sync (Deepen:
-- sheet cake says "Dairy" but it's physically in the Bakery — Freshop's
-- walkpath data is wrong sometimes and the humans in the store know better).
--
--   location_manual = TRUE  → an admin set this location by hand; the nightly
--                             sync will NOT overwrite it.
--   Clearing the location field in the admin unlocks it (auto-sync resumes).
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE CHANGES (after 026–039).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS location_manual BOOLEAN NOT NULL DEFAULT FALSE;
