-- 037_full_store_import.sql
-- FULL-STORE CATALOG (the last Round 8 P1): the whole browsable Sinclair's
-- store (~20,700 items in Freshop's storefront department tree, alcohol
-- excluded) becomes orderable — but HIDDEN by default. The barge order form
-- stays the default view; store items appear only through the per-category
-- "browse everything Sinclair's carries" expanders, the search teaser, and
-- the "shop the rest of the store" flow. ("They don't want to shop the whole
-- store — they want to go right down the list." — Dave, July 10)
--
--   store_only = TRUE  → full-store import (hidden from default browse)
--   store_only = FALSE → the curated barge catalog (everything pre-existing)
--
-- Also updates get_category_counts: the sidebar counts must keep reflecting
-- the barge catalog only, or every category count would jump by thousands.
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE CHANGES (after 026–036).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS store_only BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_store_only ON products (store_only)
  WHERE store_only = TRUE;

-- Sidebar counts = barge catalog only (default browse view)
CREATE OR REPLACE FUNCTION get_category_counts()
RETURNS TABLE(category TEXT, count BIGINT) AS $$
  SELECT category, COUNT(*) as count
  FROM products
  WHERE is_active = TRUE AND store_only = FALSE
  GROUP BY category
  ORDER BY category;
$$ LANGUAGE SQL STABLE;
