-- 029_location_walkpath.sql
-- Sinclair's store walkpath sequence for aisle-grouped shopping mode.
--
-- Freshop's product API returns not only the item location ("Aisle 9b") but
-- also fulfillment_walkpath.sequence — the store's OWN configured walking
-- order (e.g. Aisle 9b = stop 23, Dairy = stop 26). We capture it during
-- catalog enrichment and snapshot it onto order items so shopping mode can
-- sort groups in Sinclair's exact walk order — no guessing required.
-- The manager-editable store_zone_order (028) remains the fallback for items
-- without a sequence (deli/bakery UPC mismatches, older orders).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS location_seq SMALLINT;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS location_seq SMALLINT;
