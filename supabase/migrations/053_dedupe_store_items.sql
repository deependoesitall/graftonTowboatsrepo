-- Migration 053: remove duplicate store imports + prevent them at the DB level
--
-- THE BUG: the full-store importer deduped on UPC only. Produce sold by weight
-- (Calhoun heirloom tomatoes, bulk items) frequently has no barcode, so the
-- check was skipped entirely and the SAME product was re-inserted on every
-- nightly run — one extra row per sync. The catalog filled with ten identical
-- tomato cards.
--
-- The importer now dedupes on freshop_id (every Freshop item has one) with a
-- name+size fallback. This migration cleans up what already got in and adds a
-- unique index so it can never happen again, whatever the code does.

-- 1) Collapse duplicates that share a Freshop id — keep the oldest row so any
--    hand-edited image/name/location on it survives.
DELETE FROM products p
USING products q
WHERE p.store_only = TRUE
  AND q.store_only = TRUE
  AND p.freshop_id IS NOT NULL
  AND p.freshop_id = q.freshop_id
  AND p.created_at > q.created_at;

-- 2) Collapse duplicates with no Freshop id, matched on name + pack size.
DELETE FROM products p
USING products q
WHERE p.store_only = TRUE
  AND q.store_only = TRUE
  AND p.freshop_id IS NULL
  AND q.freshop_id IS NULL
  AND lower(p.description) = lower(q.description)
  AND COALESCE(p.pkg_size, '') = COALESCE(q.pkg_size, '')
  AND p.created_at > q.created_at;

-- 3) Hard guard: one store row per Freshop item, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_store_freshop_id
  ON products (freshop_id)
  WHERE store_only = TRUE AND freshop_id IS NOT NULL;

-- 4) Same guard for no-id items, on name + pack size.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_store_name_size
  ON products (lower(description), COALESCE(pkg_size, ''))
  WHERE store_only = TRUE AND freshop_id IS NULL;
