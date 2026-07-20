-- Migration 042: product popularity rank
--
-- Freshop exposes a store-wide `popularity` rank on every product (1 = most
-- popular) and Sinclair's own storefront sorts by it — their "People who
-- bought this also bought" row is that same signal, not per-product
-- co-occurrence. Syncing the rank lets us reproduce the row exactly, with real
-- Sinclair's data and no cold-start problem.
--
-- Lower number = more popular. NULL = unranked (Freshop had no signal).

ALTER TABLE products ADD COLUMN IF NOT EXISTS popularity integer;

-- Partial index: the also-bought lookup only ever reads ranked, sellable rows.
CREATE INDEX IF NOT EXISTS idx_products_popularity
  ON products (category, popularity)
  WHERE popularity IS NOT NULL AND is_active = TRUE AND is_available = TRUE;
