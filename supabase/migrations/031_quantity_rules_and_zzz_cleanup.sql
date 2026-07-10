-- 031_quantity_rules_and_zzz_cleanup.sql
-- 1. Per-product quantity rules from Sinclair's own data (Freshop):
--      quantity_step        — 0.25 for deli by-the-pound items, 1 for counted
--      quantity_label       — "bananas", "Ears", … (what you're counting)
--      quantity_size_ratio  — approx lb per unit ("Approx. 0.4 lb per banana")
--    The lb-preset dropdown now shows ONLY for items with a fractional step
--    (matching Sinclair's site); produce goes back to a count stepper.
-- 2. Scrub the "(1.0000 zzz)" junk Freshop puts in some size fields from
--    existing product details/pkg_size. Enrich also strips it going forward.
--
-- APPLY BEFORE DEPLOYING THE MATCHING CODE CHANGES.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS quantity_step       NUMERIC(6, 3),
  ADD COLUMN IF NOT EXISTS quantity_label      TEXT,
  ADD COLUMN IF NOT EXISTS quantity_size_ratio NUMERIC(7, 3);

-- One-time cleanup of existing "zzz" junk (e.g. "3# Fuji Apples (1.0000 zzz)")
UPDATE products
SET details = NULLIF(TRIM(REGEXP_REPLACE(details, '\s*\(?\d+(\.\d+)?\s*zzz\)?', '', 'gi')), '')
WHERE details ~* 'zzz';

UPDATE products
SET pkg_size = NULLIF(TRIM(REGEXP_REPLACE(pkg_size, '\s*\(?\d+(\.\d+)?\s*zzz\)?', '', 'gi')), '')
WHERE pkg_size ~* 'zzz';
