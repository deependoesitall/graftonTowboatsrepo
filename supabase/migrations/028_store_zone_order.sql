-- 028_store_zone_order.sql
-- Store walking order for aisle-grouped shopping mode.
--
-- Sinclair's product locations come in two flavors: numbered aisles
-- ("Aisle 10b") and named perimeter zones ("Produce", "Deli", "Dairy").
-- Shopping mode sorts an order's items into store-walking order so staff
-- shop each order in one efficient pass. The special "Aisles" token marks
-- where the numbered aisles fall relative to the named zones.
--
-- Editable by the Sinclair manager (they know their own store layout);
-- default is a typical grocery walk — confirm with Gloria and adjust.

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS store_zone_order JSONB NOT NULL
    DEFAULT '["Produce", "Bakery", "Deli", "Meat", "Aisles", "Dairy", "Frozen"]'::jsonb;
