-- 024_product_search_tags.sql
-- Adds keyword tags to products and a stored search_text column
-- so searching "spices" returns anything tagged "spices", regardless of product name.

-- 1. Tags array — admin sets these per product (e.g. ["spices","seasoning","baking"])
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ARRAY[]::text[];

-- 2. Immutable wrapper around array_to_string.
--    PostgreSQL requires IMMUTABLE functions in generated column expressions,
--    but the built-in array_to_string is only STABLE. This wrapper satisfies that.
CREATE OR REPLACE FUNCTION immutable_array_to_string(arr text[], sep text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT array_to_string(arr, sep);
$$;

-- 3. Stored generated column: lowercase concat of description + category + tags
--    A single ilike on this column covers all three fields at once.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    lower(description || ' ' || category || ' ' || immutable_array_to_string(tags, ' '))
  ) STORED;

-- 3. Index on search_text for fast ilike contains queries
CREATE INDEX IF NOT EXISTS products_search_text_idx
  ON products (search_text);
