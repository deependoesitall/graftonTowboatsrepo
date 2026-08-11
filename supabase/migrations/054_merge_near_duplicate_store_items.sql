-- Migration 054: merge NEAR-duplicate store items
--
-- 053 removed EXACT duplicates (same freshop_id, or identical name+size).
-- Sinclair's own catalog also carries the same product under two entries with
-- different wording, which 053 can't see because the Freshop ids differ:
--
--     "BLACKBERRIES 6 OZ"      vs  "BLACKBERRY 6 OZ"
--     "Blueberries (1 pt)"     vs  "BLUEBERRIES (1 pt)"     — both $3.49
--     "Blueberries (18 oz)"    vs  "BLUEBERRIES 18 OZ"      — both $4.99
--     "3 LB YELLOW ONION"      vs  "3 LB YELLOW ONIONS"     — both $2.69
--
-- Three normalizations are needed, because Sinclair's is inconsistent about
-- both the wording AND where the size lives:
--   1. NAME  — case, punctuation and simple plurals ("BLACKBERRIES" = blackberry)
--   2. WHERE THE SIZE IS — sometimes pkg_size ("Blueberries" + "18 oz"),
--      sometimes baked into the name ("BLUEBERRIES 18 OZ" + no pkg_size).
--      So the size is pulled out of the name whenever pkg_size is empty.
--   3. THE UNIT ITSELF — "1 GALLON" and "1 gal" are the same size. The number
--      and unit are parsed apart and the unit mapped to one spelling.
--
-- PRICE MUST ALSO MATCH — that guard is deliberate. Two same-named items at
-- different prices may genuinely be different products, and silently showing a
-- customer the wrong price is far worse than leaving a duplicate on screen.
--
-- ONE SELF-CONTAINED FUNCTION, ON PURPOSE. An earlier version split this into
-- helpers (size_pattern / strip_size_suffix / size_from_name). That failed at
-- runtime with "function strip_size_suffix(text) does not exist": when Postgres
-- inlines a SQL function into a query it re-parses the body against the CURRENT
-- search_path, which does not necessarily resolve sibling functions. Keeping
-- everything in one body means there is nothing left to resolve.

-- Clean up the 1-arg version from 053 and the helper set from the first attempt.
DROP INDEX IF EXISTS uniq_store_match_key;
DROP FUNCTION IF EXISTS public.product_match_key(text);
DROP FUNCTION IF EXISTS public.product_match_key(text, text);
DROP FUNCTION IF EXISTS public.strip_size_suffix(text);
DROP FUNCTION IF EXISTS public.size_from_name(text);
DROP FUNCTION IF EXISTS public.norm_size_token(text);
DROP FUNCTION IF EXISTS public.size_pattern();

CREATE FUNCTION public.product_match_key(p_name text, p_size text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path = public
AS $fn$
  WITH src AS (
    SELECT coalesce(p_name, '') AS nm, coalesce(p_size, '') AS sz
  ),
  -- Split a trailing "12 oz" / "(1 pt)" / "3-lb." off the name. Longest unit
  -- spellings come first so "gallon" isn't clipped to "gal".
  parts AS (
    SELECT nm, sz,
      regexp_replace(nm,
        '[[:space:](\[]*[0-9]+(\.[0-9]+)?[[:space:]]*-?[[:space:]]*(ounces?|oz|pounds?|lbs?|counts?|ct|packs?|pk|pints?|pt|quarts?|qt|gallons?|gal|liters?|litres?|milliliters?|ml|kilograms?|kg|grams?|g|inches|inch|in|dozen|doz|dz|l)\.?[[:space:]]*[)\]]?[[:space:]]*$',
        '', 'i') AS base,
      (regexp_match(nm,
        '([0-9]+(\.[0-9]+)?[[:space:]]*-?[[:space:]]*(ounces?|oz|pounds?|lbs?|counts?|ct|packs?|pk|pints?|pt|quarts?|qt|gallons?|gal|liters?|litres?|milliliters?|ml|kilograms?|kg|grams?|g|inches|inch|in|dozen|doz|dz|l))\.?[[:space:]]*[)\]]?[[:space:]]*$',
        'i'))[1] AS name_size
    FROM src
  ),
  -- pkg_size wins; fall back to whatever size was baked into the name.
  raw AS (
    SELECT nm, base,
           COALESCE(NULLIF(btrim(sz), ''), coalesce(name_size, '')) AS rs
    FROM parts
  ),
  -- Parse "1 GALLON" into number + unit so the unit can be canonicalized.
  tok AS (
    SELECT nm, base, rs,
           regexp_match(lower(rs), '([0-9]+(\.[0-9]+)?)[^a-z0-9]*([a-z]+)?') AS m
    FROM raw
  )
  SELECT
    -- ── name half ──
    -- lowercase, strip punctuation, "ies"->"y", drop a trailing plural "s".
    -- If the name was NOTHING BUT a size, keep the original, so it can't
    -- collapse into a bare "|12oz" key shared with unrelated rows.
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(CASE WHEN btrim(base) = '' THEN nm ELSE base END),
                       '[^a-z0-9]', '', 'g'),
        'ies', 'y', 'g'),
      's$', '')
    || '|' ||
    -- ── size half ──
    CASE
      -- No number at all. "each" is not a size, so it must read the same as a
      -- blank pkg_size or "BANANAS" and "Banana (each)" stay split forever.
      WHEN m IS NULL THEN
        CASE WHEN regexp_replace(lower(rs), '[^a-z0-9]', '', 'g') IN ('each', 'ea')
             THEN '' ELSE regexp_replace(lower(rs), '[^a-z0-9]', '', 'g') END
      ELSE m[1] || CASE
        WHEN coalesce(m[3], '') IN ('oz','ounce','ounces')                     THEN 'oz'
        WHEN coalesce(m[3], '') IN ('lb','lbs','pound','pounds')               THEN 'lb'
        WHEN coalesce(m[3], '') IN ('gal','gallon','gallons')                  THEN 'gal'
        WHEN coalesce(m[3], '') IN ('pt','pint','pints')                       THEN 'pt'
        WHEN coalesce(m[3], '') IN ('qt','quart','quarts')                     THEN 'qt'
        WHEN coalesce(m[3], '') IN ('ml','milliliter','milliliters')           THEN 'ml'
        WHEN coalesce(m[3], '') IN ('l','liter','liters','litre','litres')     THEN 'l'
        WHEN coalesce(m[3], '') IN ('kg','kilogram','kilograms')               THEN 'kg'
        WHEN coalesce(m[3], '') IN ('g','gram','grams')                        THEN 'g'
        WHEN coalesce(m[3], '') IN ('ct','cnt','count','counts')               THEN 'ct'
        WHEN coalesce(m[3], '') IN ('pk','pkg','pack','packs')                 THEN 'pk'
        WHEN coalesce(m[3], '') IN ('in','inch','inches')                      THEN 'in'
        WHEN coalesce(m[3], '') IN ('dz','doz','dozen')                        THEN 'dz'
        WHEN coalesce(m[3], '') IN ('ea','each')                               THEN 'ea'
        ELSE coalesce(m[3], '')
      END
    END
  FROM tok;
$fn$;

-- ── Merge ────────────────────────────────────────────────────────────────────
-- Keep the BEST row of each set: one that already has a photo wins, then the
-- oldest (so any hand-corrected image/name/location survives the merge).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY public.product_match_key(description, pkg_size), price
           ORDER BY (image_url IS NULL), created_at
         ) AS rn
  FROM products
  WHERE store_only = TRUE
)
DELETE FROM products p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

-- Stop new ones forming: one store row per (normalized name+size, price).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_store_match_key
  ON products (public.product_match_key(description, pkg_size), price)
  WHERE store_only = TRUE;
