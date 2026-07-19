-- 035_order_form_layout.sql
-- THE selling point from the July 10 demo: barges must see items in the EXACT
-- order of the paper order form ("It is very key that the barges see the order
-- as they see it on paper now").
--
--   form_section    — the form's top-level department (Meat, Dairy, Produce,
--                     Grocery, Cold Deli, Bakery) in form order.
--   form_subsection — the form's row labels (Beef / Pork / Poultry / Cheese /
--                     Condiments / …) — Jen's subcategories.
--   form_seq        — global position on the paper form. "All items" runs
--                     from the first meat item straight down, exactly like
--                     the paper. NULL = not on the order form (full-store
--                     items later import with NULL and sort after).
--
-- Backfill: admin → Products → "Apply Order-Form Layout" (reads
-- src/data/order-form-layout.json, matches by UPC → description+pack → description).
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE CHANGES (after 026–034).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS form_section    TEXT,
  ADD COLUMN IF NOT EXISTS form_subsection TEXT,
  ADD COLUMN IF NOT EXISTS form_seq        INTEGER;

CREATE INDEX IF NOT EXISTS idx_products_form_seq ON products (form_seq)
  WHERE form_seq IS NOT NULL;

-- Bulk apply — one RPC instead of ~1,160 REST updates (Vercel function
-- timeouts). The admin route matches products to form rows in memory, then
-- hands the whole mapping to this function in a single call.
CREATE OR REPLACE FUNCTION apply_form_layout(items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE products p SET
    form_section    = x.section,
    form_subsection = x.subsection,
    form_seq        = x.seq
  FROM jsonb_to_recordset(items) AS x(id uuid, section text, subsection text, seq integer)
  WHERE p.id = x.id;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;
