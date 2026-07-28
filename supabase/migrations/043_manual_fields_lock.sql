-- Migration 043: per-field manual-edit lock
--
-- Generalizes the location_manual pattern to EVERY editable field. When an
-- admin changes a field in the product editor (a description, a price, the
-- weight flag…), that field name is recorded here and the nightly sync leaves
-- it alone from then on — permanently, through inactive spells and seasonal
-- comebacks. A hand-written description on a seasonal item survives the item
-- going away and returning next season, because the row is never deleted and
-- the sync is told not to touch what a human set.
--
-- Only fields a human actually CHANGED are recorded (the API diffs against the
-- stored row), so re-saving a product without touching the price doesn't
-- accidentally freeze it against Sinclair's price updates.

ALTER TABLE products ADD COLUMN IF NOT EXISTS manual_fields text[] NOT NULL DEFAULT '{}';

-- Carry the existing location locks into the new general mechanism so nothing
-- that's already hand-corrected gets re-synced after this ships.
UPDATE products
   SET manual_fields = ARRAY['location', 'location_seq']::text[]
 WHERE location_manual = TRUE
   AND (manual_fields IS NULL OR manual_fields = '{}');
