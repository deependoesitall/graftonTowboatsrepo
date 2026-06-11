-- 014_restore_wrongly_deleted_duplicates.sql
--
-- The "Delete All Duplicates" tool grouped products by UPC alone. Sinclair
-- Foods' source spreadsheet reuses the same UPC across distinct flavor/size
-- variants (e.g. all Blue Bell ice cream flavors share UPC 7189983548, and
-- placeholder UPCs like "BAKERY", "FAMOUS", "FRESH BAKED" are reused across
-- many unrelated bakery items). The tool kept only the first item per UPC
-- group and deleted the other 16 — but those were genuinely distinct
-- products, not duplicates.
--
-- This migration re-adds those 16 items as they appeared in the original
-- Sinclair Foods catalog. Re-running this migration is safe: it only
-- inserts rows that don't already exist (matched on description + pkg_size).

-- The three "GARLIC, SLEEVE / 4 oz / $4.99" rows below are legitimate exact
-- triplicates from the source spreadsheet (not a numbering error). The
-- NOT EXISTS guard on the main block would prevent re-inserting duplicates
-- of each other, so they're inserted unconditionally in a separate guarded
-- block keyed on total count.
INSERT INTO products (category, sub_category, upc, description, pkg_size, uom, price, is_active, is_available)
SELECT 'Produce', '7096900001', 'GARLIC, SLEEVE', '4 oz', 'EA', 4.99, TRUE, TRUE
FROM generate_series(1, 3)
WHERE (
  SELECT COUNT(*) FROM products
  WHERE description = 'GARLIC, SLEEVE' AND pkg_size = '4 oz' AND price = 4.99
) = 0;

INSERT INTO products (category, sub_category, upc, description, pkg_size, uom, price, is_active, is_available)
SELECT v.category, v.category, v.upc, v.description, v.pkg_size, v.uom, v.price, TRUE, TRUE
FROM (VALUES
  ('Pantry & Grocery', '7003835052', 'BST-CH ENG MUFFINS',           '6 pk',     NULL,  2.15),
  ('Dairy & Eggs',      '5000032275', 'COFFEEMATE ITALIAN CREAM',     '32 oz',    NULL,  5.59),
  ('Dairy & Eggs',      '5000032290', 'COFFEEMATE CARAMEL LATTE CRM', '32 oz',    NULL,  5.59),
  ('Pantry & Grocery',  '7189983548', 'BLUE BELL ICE CREAM CHOCOLATE',    'HALF GAL', NULL, 9.69),
  ('Pantry & Grocery',  '7189983548', 'BLUE BELL ICE CREAM BUTTER PECAN', 'HALF GAL', NULL, 9.69),
  ('Pantry & Grocery',  '7189983548', 'BLUE BELL ICE CREAM STRAWBERRY',   'HALF GAL', NULL, 9.69),
  ('Pantry & Grocery',  '7189983548', 'BLUE BELL ICE CREAM (ASSORTED FLAVORS)', NULL, NULL, 9.69),
  ('Bakery & Deli',     'FAMOUS',     'GRANDMA SINCLAIR''S APPLE PIE', 'EA',      NULL,  14.99),
  ('Bakery & Deli',     'FRESH BAKED','ROUND RYE BREAD (for dill dip)', 'EA',     NULL,  2.99),
  ('Pantry & Grocery',  '3000003100', 'A J YELLOW CORNMEAL',           '5 LB',    NULL,  4.15),
  ('Pantry & Grocery',  '2850010040', 'L LEAF PEACH PIE FIL',          '21 oz',   NULL,  4.85),
  ('Bakery & Deli',     'BAKERY',     'FRESH LOAF SOURDOUGH',          'LOAF',    NULL,  0.00),
  ('Pantry & Grocery',  '2100064425', 'KR ITALIAN ZESTY DRESSING',     '16 oz',   NULL,  4.99)
) AS v(category, upc, description, pkg_size, uom, price)
WHERE NOT EXISTS (
  SELECT 1 FROM products p
  WHERE p.description = v.description
    AND COALESCE(p.pkg_size, '') = COALESCE(v.pkg_size, '')
    AND p.price = v.price
);
