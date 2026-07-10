-- 030_decimal_quantities.sql
-- Fractional quantities for by-the-pound items (Dave's request via Jen):
-- deli salads in ¼ / ½ lb increments, hamburger in 1 / 3 / 5 lb — the same
-- preset amounts Sinclair's own site offers. Quantity for by-weight items
-- now MEANS pounds requested; regular items keep whole counts.
--
-- APPLY BEFORE DEPLOYING THE MATCHING CODE CHANGES.

ALTER TABLE order_items
  ALTER COLUMN quantity TYPE NUMERIC(7, 2);
-- The existing CHECK (quantity > 0) still applies and is all we need.
