-- Migration 049: nightly auto photo/name backfill marker
--
-- The nightly sync now name-matches barge items the barcode pass can't reach
-- (POS abbreviations like "SCHUBERT DNR YST RLS", "MM LEMONADE") and
-- auto-applies HIGH-confidence matches — pulling the real name + photo so
-- obvious items clean themselves up without anyone clicking Find Photos.
--
-- This marker records the last time an item was tried, so the sync doesn't
-- re-search the same no-match items every single night (only re-tries after 14
-- days, in case Sinclair's added the product since).

ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_match_tried_at timestamptz;
