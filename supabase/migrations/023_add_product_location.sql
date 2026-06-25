-- Migration 023: Add location to products table
-- Stores the in-store shelf/department location (e.g. "Cold Deli", "Aisle 3 - Canned Goods").
-- Also adds location to order_items so the location is captured at order time,
-- just like description and category are captured at order time.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS location text DEFAULT NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS location text DEFAULT NULL;

COMMENT ON COLUMN products.location IS 'In-store shelf or department location, e.g. "Cold Deli", "Aisle 3 - Beverages". Shown to shoppers when picking an order.';
COMMENT ON COLUMN order_items.location IS 'In-store location copied from the product at order time. Shown to Sinclair shoppers in picking view.';
