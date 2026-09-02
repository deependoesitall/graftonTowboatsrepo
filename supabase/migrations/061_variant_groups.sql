-- 061_variant_groups.sql
--
-- SIZE VARIANTS — collapse the order form's repeated cuts into one card.
--
-- The paper barge form lists the same cut once per weight/pack:
--
--     CAB RIBEYE STEAK    2 PK   $32.99
--     CAB RIBEYE STEAK    4 PK   $65.97
--     CAB RIBEYE STEAK    8 PK  $131.94
--     GROUND CHUCK 80% LEAN  (pkg 3#)  $14.97
--     GROUND CHUCK 80% LEAN  (pkg 5#)  $24.95
--
-- That is correct on paper — a cook scans a column. It is terrible in a grid,
-- where it reads as three near-identical photos of the same steak and buries
-- the rest of the meat case below the fold.
--
-- WHAT THIS DOES *NOT* DO: it does not merge or delete rows. Every size keeps
-- its own product row, id, price and register identity, because Sinclair's
-- picks and rings the specific SKU — the pick sheet must stay exact. This only
-- labels rows so the STOREFRONT can draw one card with a size chooser.
--
-- The size token lives in one of two places, which is why this needs parsing
-- rather than a GROUP BY:
--   1. glued to the description  — "~5lb", "5#", "4 PK", "12 ct"
--   2. in the pkg_size column    — "3#", "2 pk", "16 oz", "30 ct"
--
-- Deliberately ONE plpgsql function. Migration 054 was rewritten twice because
-- nested SQL helper functions get re-parsed against the caller's search_path
-- during inlining and vanish at runtime. plpgsql doing DML is not inlined, so
-- this is safe.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS variant_group text,
  ADD COLUMN IF NOT EXISTS variant_label text,
  ADD COLUMN IF NOT EXISTS variant_rank  numeric;

-- Grid queries page by form_seq and then bucket by group; this keeps that cheap.
CREATE INDEX IF NOT EXISTS idx_products_variant_group
  ON products (variant_group, variant_rank)
  WHERE variant_group IS NOT NULL;

COMMENT ON COLUMN products.variant_group IS
  'Shared key for size variants of one product. NULL = renders as its own card.';
COMMENT ON COLUMN products.variant_label IS
  'Chip label shown in the size chooser: "3 lb", "8 pk", "16 oz".';
COMMENT ON COLUMN products.variant_rank IS
  'Numeric size, ascending — orders the chips smallest to largest.';


CREATE OR REPLACE FUNCTION public.rebuild_variant_groups()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  touched integer;
BEGIN
  -- Full rebuild every run: a group that drops to one member must lose its
  -- key, or the storefront draws a "chooser" with a single chip forever.
  UPDATE products
     SET variant_group = NULL, variant_label = NULL, variant_rank = NULL
   WHERE variant_group IS NOT NULL;

  WITH src AS (
    SELECT
      p.id,
      p.category,
      -- Collapse the form's alignment padding ("CAB RIBEYE STEAK     4 PK").
      regexp_replace(coalesce(p.description, ''), '\s+', ' ', 'g') AS nm,
      btrim(coalesce(p.pkg_size, ''))                              AS pk
    FROM products p
    WHERE p.is_active
      AND coalesce(p.description, '') <> ''
  ),
  m AS (
    SELECT
      id, category, nm, pk,
      -- (1) size glued to the description, most specific pattern first
      regexp_match(nm, '^(.*?)\s*~\s*([0-9]+(?:\.[0-9]+)?)\s*lb\.?$',  'i') AS m_tilde,
      regexp_match(nm, '^(.*?)\s+([0-9]+(?:\.[0-9]+)?)\s*#$',          'i') AS m_hash,
      regexp_match(nm, '^(.*?)\s+([0-9]+(?:\.[0-9]+)?)\s*pk$',         'i') AS m_pk,
      regexp_match(nm, '^(.*?)\s+([0-9]+(?:\.[0-9]+)?)\s*ct$',         'i') AS m_ct,
      -- (2) otherwise the pkg_size column carries it
      regexp_match(pk, '^([0-9]+(?:\.[0-9]+)?)\s*(#|lbs?|oz|pk|ct|pack)$', 'i') AS m_size
    FROM src
  ),
  parsed AS (
    SELECT
      id, category,
      CASE
        WHEN m_tilde IS NOT NULL THEN m_tilde[1]
        WHEN m_hash  IS NOT NULL THEN m_hash[1]
        WHEN m_pk    IS NOT NULL THEN m_pk[1]
        WHEN m_ct    IS NOT NULL THEN m_ct[1]
        WHEN m_size  IS NOT NULL THEN nm
      END AS base,
      CASE
        WHEN m_tilde IS NOT NULL THEN m_tilde[2]::numeric
        WHEN m_hash  IS NOT NULL THEN m_hash[2]::numeric
        WHEN m_pk    IS NOT NULL THEN m_pk[2]::numeric
        WHEN m_ct    IS NOT NULL THEN m_ct[2]::numeric
        WHEN m_size  IS NOT NULL THEN m_size[1]::numeric
      END AS val,
      CASE
        WHEN m_tilde IS NOT NULL THEN 'lb'
        WHEN m_hash  IS NOT NULL THEN 'lb'
        WHEN m_pk    IS NOT NULL THEN 'pk'
        WHEN m_ct    IS NOT NULL THEN 'ct'
        WHEN m_size  IS NOT NULL THEN
          CASE lower(m_size[2])
            WHEN '#'    THEN 'lb'
            WHEN 'lb'   THEN 'lb'
            WHEN 'lbs'  THEN 'lb'
            WHEN 'pack' THEN 'pk'
            ELSE lower(m_size[2])
          END
      END AS unit
    FROM m
  ),
  keyed AS (
    SELECT
      id,
      val,
      unit,
      -- Category is part of the key so a "2 pk" in Meat can never merge with a
      -- same-named "2 pk" in Deli. Unit is part of the key so oz and pk never
      -- share a chooser.
      lower(regexp_replace(category, '[^a-zA-Z0-9]', '', 'g')) || '|' ||
      lower(regexp_replace(base,     '[^a-zA-Z0-9]', '', 'g')) || '|' ||
      unit AS gkey
    FROM parsed
    WHERE base IS NOT NULL
      AND btrim(base) <> ''
      AND val > 0
  ),
  -- A chooser needs at least two DISTINCT sizes. The form has literal duplicate
  -- rows (STEAK, BEEF ROUND 2 PK appears twice); those must not qualify a group.
  eligible AS (
    SELECT gkey
    FROM keyed
    GROUP BY gkey
    HAVING count(DISTINCT val) > 1
  )
  UPDATE products p
     SET variant_group = k.gkey,
         variant_rank  = k.val,
         -- "3 lb" / "2.5 lb" / "16 oz" — never "3." (to_char keeps the point
         -- whenever the format string carries decimals, FM or not).
         variant_label = CASE
                           WHEN k.val = trunc(k.val) THEN trunc(k.val)::bigint::text
                           ELSE trim(to_char(k.val, 'FM9999990.99'))
                         END || ' ' || k.unit
    FROM keyed k
    JOIN eligible e ON e.gkey = k.gkey
   WHERE p.id = k.id;

  GET DIAGNOSTICS touched = ROW_COUNT;
  RETURN touched;
END;
$fn$;

COMMENT ON FUNCTION public.rebuild_variant_groups() IS
  'Recompute size-variant groupings. Re-run after any bulk catalog change. Returns rows labelled.';

-- Populate for the catalog as it stands today.
SELECT public.rebuild_variant_groups();
