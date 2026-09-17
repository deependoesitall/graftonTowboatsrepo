-- One-shot: GRAPES WHITE BAG (upc 4022) had details "TOP SOIL (plu 402)"
-- from a PLU truncate collision (4022→402). Freshop id 2311218 IS correct
-- (White/Green Seedless Grapes, upc 4022). Do NOT switch to 77937/4498 —
-- that is a duplicate store listing with a different UPC.
--
-- After deploy: Rebuild rails (admin Products → Rebuild rails) so the sale
-- card re-resolves; title comes from productDisplayName(details||description).

BEGIN;

-- Preview
-- SELECT id, description, details, upc, freshop_id FROM products
-- WHERE id = '20baf45d-e9fb-4032-9986-bbff8a22f4d2';

UPDATE products
SET
  details = 'White/Green Seedless Grapes (lb)',
  updated_at = now()
WHERE id = '20baf45d-e9fb-4032-9986-bbff8a22f4d2'
  AND upc = '4022'
  AND (
    details IS NULL
    OR details ILIKE '%TOP SOIL%'
    OR details ~* '\\(plu[[:space:]]*402\\)'
  );

-- Optional: any other row where details (plu N) disagrees with upc digits
-- and the name in details clearly isn't the description. Currently only
-- the grapes row matches this class; kept as a safety net.
UPDATE products p
SET
  details = NULL,
  updated_at = now()
WHERE p.details ~* '\\(plu[[:space:]]*([0-9]+)\\)'
  AND regexp_replace(coalesce(p.upc, ''), '\\D', '', 'g') <> ''
  AND (regexp_replace(p.details, '.*\\(plu[[:space:]]*([0-9]+).*', '\\1'))
      <> regexp_replace(coalesce(p.upc, ''), '\\D', '', 'g')
  AND p.id <> '20baf45d-e9fb-4032-9986-bbff8a22f4d2'
  AND (
    -- only clear when details name looks unrelated to description
    lower(p.details) NOT LIKE '%' || lower(split_part(p.description, ',', 1)) || '%'
  );

COMMIT;

-- Verify
-- SELECT id, description, details, upc, freshop_id FROM products
-- WHERE id = '20baf45d-e9fb-4032-9986-bbff8a22f4d2'
--    OR freshop_id IN ('2311218','77937') OR upc IN ('4022','4498');
