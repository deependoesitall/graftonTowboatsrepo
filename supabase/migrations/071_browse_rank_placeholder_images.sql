-- 071_browse_rank_placeholder_images.sql
--
-- PUSH SINCLAIR'S PLACEHOLDER-IMAGE ITEMS TO THE END OF THE CATALOG.
--
-- ── WHAT THE PROBLEM ACTUALLY IS ─────────────────────────────────────────
--
-- Browsing the store shows runs of identical grey shopping-basket graphics.
-- It reads as a broken or half-loaded catalog, which is the worst possible
-- first impression for a captain deciding whether to trust an unfamiliar
-- vendor with the galley order.
--
-- ⚠️ IT IS NOT A MISSING IMAGE. That's what makes it easy to get wrong.
-- Freshop serves a real, valid image URL for products it has no photo of:
--
--     https://images.freshop.ncrcloud.com/fp_dpt_generic/<hash>_large.png
--
-- So `image_url IS NOT NULL` is true, the <img> loads fine, and
-- `has_visible_image` (migration 070) reports TRUE. Every check we had said
-- these products were fine. Measured against the live catalog, Sept 2026:
--
--     680    products point at that one fp_dpt_generic URL
--     11,029 distinct image URLs overall
--     6      uses of the next most-repeated URL
--
-- 680 sharing one URL against a runner-up of 6 is not a coincidence worth
-- hedging about — that is unambiguously the placeholder.
--
-- ── WHY form_seq IS IN THE RULE ──────────────────────────────────────────
--
-- The barge list must NOT be reordered (Deepen, Sept 2026). It's a curated
-- order form and its sequence is the point — a cook works down it the way
-- they always have. Reshuffling it to chase prettier pictures would break a
-- workflow to fix a cosmetic problem.
--
-- The split is clean, which is why this is safe:
--
--     680 placeholder items → 670 are Sinclair's-only (form_seq IS NULL)
--                             10 are on the barge list  (form_seq NOT NULL)
--     181 items with NO image at all → ALL 181 are barge list
--
-- So `form_seq IS NOT NULL → rank 0` freezes the barge list exactly as it is,
-- including those 10 and all 181, and only the 670 pure-catalog items move.
--
-- ── WHY THIS IS A VIEW COLUMN, NOT A TABLE COLUMN ────────────────────────
--
-- The nightly Freshop sync rewrites image_url. A stored column would need
-- maintaining on every write and would drift silently the moment someone
-- forgot. Computing it in the view means it can never disagree with the data
-- it's derived from.

-- ── The placeholder test, as a function so there is ONE definition ────────
--
-- If Freshop ever changes the placeholder path, this is the single line to
-- edit. Writing the LIKE inline in the view would have buried the same magic
-- string in three places.
CREATE OR REPLACE FUNCTION is_real_product_image(url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT url IS NOT NULL
     AND btrim(url) <> ''
     AND position('fp_dpt_generic' in url) = 0;
$$;

COMMENT ON FUNCTION is_real_product_image(text) IS
  'True when a product image URL is an actual photograph rather than Freshop''s generic fp_dpt_generic basket placeholder. See migration 071.';


DROP VIEW IF EXISTS products_catalog;

CREATE VIEW products_catalog
WITH (security_invoker = true)   -- MUST STAY. See migration 070: without it the
                                 -- view bypasses products_public_read and leaks
                                 -- inactive rows (incl. disabled hot food) to
                                 -- the public anon key.
AS
SELECT
  p.*,

  -- UNCHANGED from migration 070. Deliberately still counts the placeholder as
  -- "visible", because it IS visible — something renders. Other code may rely
  -- on that meaning, so the new behaviour goes in a new column rather than
  -- quietly redefining this one.
  (
    (p.image_url IS NOT NULL AND btrim(p.image_url) <> '')
    OR (
      p.variant_group IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM products s
         WHERE s.variant_group = p.variant_group
           AND s.image_url IS NOT NULL
           AND btrim(s.image_url) <> ''
      )
    )
  ) AS has_visible_image,

  -- A genuine photograph — its own, or one borrowed from a size sibling.
  -- Variant borrowing matters: "MILK 1 GAL" may have the placeholder while
  -- "MILK 1/2 GAL" has a real photo, and the card renders the sibling's. It
  -- would be wrong to demote a card that displays a real picture.
  (
    is_real_product_image(p.image_url)
    OR (
      p.variant_group IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM products s
         WHERE s.variant_group = p.variant_group
           AND is_real_product_image(s.image_url)
      )
    )
  ) AS has_real_image,

  -- THE SORT KEY. 0 sorts first, 1 last.
  CASE
    -- Barge list: frozen. Every row gets 0, so this column can never change
    -- their relative order — including where several share a form_seq because
    -- they're size variants of one line.
    --
    -- BOTH flags are checked deliberately. Measured Sept 2026 they agree
    -- exactly — 1,125 rows have form_seq NOT NULL and 1,125 have
    -- store_only = false, with zero disagreement either way. But they mean
    -- different things: form_seq is a position on the printed form, store_only
    -- is what the row IS. A barge item added without a sequence number would
    -- slip past a form_seq-only guard and get demoted. Either flag saying
    -- "barge" is enough to protect the row, which is the safe direction to
    -- fail in — the cost of wrongly protecting a row is a grey basket someone
    -- scrolls past; the cost of wrongly demoting one is a cook not finding an
    -- item they order every week.
    WHEN p.form_seq IS NOT NULL OR p.store_only = false THEN 0
    WHEN is_real_product_image(p.image_url) THEN 0
    WHEN p.variant_group IS NOT NULL AND EXISTS (
      SELECT 1 FROM products s
       WHERE s.variant_group = p.variant_group
         AND is_real_product_image(s.image_url)
    ) THEN 0
    ELSE 1
  END AS browse_rank

FROM products p;

COMMENT ON VIEW products_catalog IS
  'products plus has_visible_image, has_real_image and browse_rank. browse_rank=1 marks Sinclair''s catalog items showing only Freshop''s generic placeholder, so they sort to the end of browse and search; barge-list rows (form_seq NOT NULL) are always 0 and never reordered. security_invoker=true so the caller''s RLS applies (migration 070).';


-- ── Verify after running ──────────────────────────────────────────────────
--
-- Expect roughly: rank 0 → 11,327   rank 1 → 670
-- SELECT browse_rank, count(*) FROM products_catalog GROUP BY 1 ORDER BY 1;
--
-- MUST be 0 — proves no barge-list row was demoted:
-- SELECT count(*) FROM products_catalog
--  WHERE browse_rank = 1 AND form_seq IS NOT NULL;
--
-- MUST still be 0 — proves migration 070's fix survived this rewrite:
-- SET ROLE anon;
-- SELECT count(*) FROM products_catalog WHERE NOT is_active;
-- RESET ROLE;
