-- 100_rebuild_variant_groups_packs.sql
--
-- Pork steaks (and the rest of the meat case) list as 2 PK / 4 PK / 8 PK on
-- the barge form. The storefront already collapses those into one card with a
-- size chooser — but only after rebuild_variant_groups() runs. Barge catalog
-- replaces and nightly layout stamps were leaving variant_group NULL, so cooks
-- saw three pork-steak tiles instead of one.
--
-- Also accept PACK / PKS / a trailing period on the size token, which is how
-- a few form rows arrive.

CREATE OR REPLACE FUNCTION public.rebuild_variant_groups()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  touched integer;
BEGIN
  UPDATE products
     SET variant_group = NULL, variant_label = NULL, variant_rank = NULL
   WHERE variant_group IS NOT NULL;

  WITH src AS (
    SELECT
      p.id,
      p.category,
      regexp_replace(coalesce(p.description, ''), '\s+', ' ', 'g') AS nm,
      btrim(coalesce(p.pkg_size, ''))                              AS pk
    FROM products p
    WHERE p.is_active
      AND coalesce(p.description, '') <> ''
  ),
  m AS (
    SELECT
      id, category, nm, pk,
      regexp_match(nm, '^(.*?)\s*~\s*([0-9]+(?:\.[0-9]+)?)\s*lb\.?$',                    'i') AS m_tilde,
      regexp_match(nm, '^(.*?)\s+([0-9]+(?:\.[0-9]+)?)\s*#$',                            'i') AS m_hash,
      regexp_match(nm, '^(.*?)\s+([0-9]+(?:\.[0-9]+)?)\s*(pk|pack)s?\.?$',                'i') AS m_pk,
      regexp_match(nm, '^(.*?)\s+([0-9]+(?:\.[0-9]+)?)\s*ct$',                            'i') AS m_ct,
      regexp_match(pk, '^([0-9]+(?:\.[0-9]+)?)\s*-?\s*(#|lbs?|oz|pks?|packs?|ct)$',      'i') AS m_size
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
            WHEN '#'     THEN 'lb'
            WHEN 'lb'    THEN 'lb'
            WHEN 'lbs'   THEN 'lb'
            WHEN 'pack'  THEN 'pk'
            WHEN 'packs' THEN 'pk'
            WHEN 'pks'   THEN 'pk'
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
      lower(regexp_replace(category, '[^a-zA-Z0-9]', '', 'g')) || '|' ||
      lower(regexp_replace(base,     '[^a-zA-Z0-9]', '', 'g')) || '|' ||
      unit AS gkey
    FROM parsed
    WHERE base IS NOT NULL
      AND btrim(base) <> ''
      AND val > 0
  ),
  eligible AS (
    SELECT gkey
    FROM keyed
    GROUP BY gkey
    HAVING count(DISTINCT val) > 1
  )
  UPDATE products p
     SET variant_group = k.gkey,
         variant_rank  = k.val,
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

SELECT public.rebuild_variant_groups();
