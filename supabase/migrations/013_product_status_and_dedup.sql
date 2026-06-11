-- 013_product_status_and_dedup.sql
-- Adds is_available (Out of Stock toggle) separate from is_active (hide from catalog)
-- and supporting indexes for duplicate detection.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE;

-- Public catalog query already filters on is_active; also filter on is_available
-- in app code. Index helps both filters.
CREATE INDEX IF NOT EXISTS idx_products_available ON products (is_available);

-- Speeds up UPC + price duplicate matching
CREATE INDEX IF NOT EXISTS idx_products_upc_price ON products (upc, price) WHERE upc IS NOT NULL;

-- Speeds up name + pack_size + price fallback duplicate matching
CREATE INDEX IF NOT EXISTS idx_products_desc_pkg_price ON products (description, pkg_size, price);
