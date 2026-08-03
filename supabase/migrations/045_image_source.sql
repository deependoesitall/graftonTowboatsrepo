-- Migration 045: image provenance
--
-- Records WHERE each product photo came from, so the admin can tell a
-- confidently-synced barcode photo from a fuzzy name-match that deserves a
-- second look, from a real photo someone uploaded.
--   sinclair_sync — matched to Sinclair's by UPC in the nightly sync (trusted)
--   name_match    — Find Photos name-matched it (fuzzy — review before trusting)
--   manual        — a human uploaded it (e.g. Dave's butcher photos)
--   off           — Open Food Facts by barcode (future)
--   NULL          — no image / unknown origin

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_source text;

-- Anything that already has a photo AND a Sinclair's match came from the sync.
UPDATE products
   SET image_source = 'sinclair_sync'
 WHERE image_url IS NOT NULL AND freshop_id IS NOT NULL AND image_source IS NULL;
