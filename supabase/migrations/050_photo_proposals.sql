-- Migration 050: nightly photo-match REVIEW QUEUE
--
-- The nightly sync name-matches unmatched barge items against Sinclair's.
-- Strong matches (name + price/size corroborated) auto-apply. WEAKER matches
-- are parked here as a PROPOSAL for a human to approve or reject in the Photo
-- Review tab — so the obvious items fill in on their own while the judgment
-- calls wait for a person.
--
--   proposed_image_url — Sinclair's photo we'd use
--   proposed_details   — the cleaned display name we'd use
--   proposed_name      — Sinclair's verbatim listing name (review context)
--   proposed_score     — match confidence (0–1), for sorting / badges

ALTER TABLE products ADD COLUMN IF NOT EXISTS proposed_image_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS proposed_details   text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS proposed_name      text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS proposed_score     numeric(4,2);

CREATE INDEX IF NOT EXISTS idx_products_proposed
  ON products (proposed_score DESC)
  WHERE proposed_image_url IS NOT NULL;
