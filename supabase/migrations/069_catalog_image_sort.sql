-- 069_catalog_image_sort.sql
--
-- PUSH PHOTO-LESS ITEMS TO THE BACK OF THE CATALOG.
--
-- THE PROBLEM. Sinclair's own site carries placeholder images for items they
-- have no product photo of — trays, bulk bakery, in-store deli. Those sync to
-- us faithfully, which is correct. But the catalog sorts alphabetically inside
-- each category, and a lot of the photo-less items start with digits or store
-- shorthand: "3 Pc Tender Meal", "3-Meat Burrito", "37 RASPBERRY DANISH",
-- "8 2 LAYER". So they cluster at the FRONT, and the first thing a captain sees
-- is a wall of grey baskets. The catalog looks broken when it isn't.
--
-- WHY THIS NEEDS A VIEW RATHER THAN A GENERATED COLUMN.
--
-- The obvious fix — order by `image_url IS NULL` — is WRONG here, and quietly
-- so. A product with no image of its own still displays a photo borrowed from a
-- sibling in its variant group: ProductGrid does
--
--     active.image_url || set?.options.find(o => o.image_url)?.image_url
--
-- so "CAB CHUCK ROAST ~5lb" shows the ~8lb photo. Sorting on the column alone
-- would bury items that visibly DO have a picture, and nobody would understand
-- why. A generated column can't help either, because it cannot look at other
-- rows.
--
-- So the flag has to be group-aware, which means a view.

-- The EXISTS below probes by variant_group on every row. Without this index
-- that's a sequential scan across ~12,000 products per catalog page.
CREATE INDEX IF NOT EXISTS idx_products_variant_group_image
  ON products (variant_group)
  WHERE variant_group IS NOT NULL AND image_url IS NOT NULL;

CREATE OR REPLACE VIEW products_catalog AS
SELECT
  p.*,
  (
    -- Its own photo…
    (p.image_url IS NOT NULL AND btrim(p.image_url) <> '')
    -- …or one it will visibly borrow from a size sibling.
    OR (
      p.variant_group IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM products s
         WHERE s.variant_group = p.variant_group
           AND s.image_url IS NOT NULL
           AND btrim(s.image_url) <> ''
      )
    )
  ) AS has_visible_image
FROM products p;

COMMENT ON VIEW products_catalog IS
  'products plus has_visible_image — true when the card will actually render a photo, including one borrowed from a variant-group sibling. Used to sort placeholder-image items to the end of the public catalog.';

-- Check — how much of the catalogue is affected:
-- SELECT has_visible_image, count(*)
--   FROM products_catalog
--  WHERE is_active AND is_available
--  GROUP BY 1;
