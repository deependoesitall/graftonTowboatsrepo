-- 079: Freshop-style preferred substitutions (customer preference at place time)
--
-- Staff already mark OOS + create substitution lines (016_phase2a).
-- This adds the *customer's* preferred swap so Sinclair can pre-fill the
-- replace panel, and so pick sheet / PDF / email can show the full audit:
-- struck original + linked substitute (+ "CUSTOMER PREFERRED" when matched).
--
-- Modes:
--   product      — use preferred_sub_product_id (snapshot description optional)
--   none         — do not substitute; drop the line if OOS
--   store_choice — shopper decides
--
-- Guests have no preferred-sub UI; columns stay NULL.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS preferred_sub_product_id uuid NULL
    REFERENCES products(id),
  ADD COLUMN IF NOT EXISTS preferred_sub_mode text NULL
    CHECK (preferred_sub_mode IS NULL OR preferred_sub_mode IN ('product', 'none', 'store_choice')),
  ADD COLUMN IF NOT EXISTS preferred_sub_description text NULL;

COMMENT ON COLUMN order_items.preferred_sub_product_id IS
  'Catalog product the customer prefers if the original is OOS (mode=product).';
COMMENT ON COLUMN order_items.preferred_sub_mode IS
  'product | none | store_choice — customer preference captured at place time.';
COMMENT ON COLUMN order_items.preferred_sub_description IS
  'Snapshot of preferred product description at place time (survives catalog edits).';

-- Soft consistency: mode=product should point at a product; other modes clear id.
-- Enforced in app layer (place-order) rather than a CHECK that would reject
-- historical/partial rows.
