-- ============================================================
-- Phase 1 Changes
-- 1. Add customer_email to orders (for two-email flow)
-- 2. Add upc to order_items (snapshot at order time)
-- 3. Fix banana product: sell by each, not lbs
-- ============================================================

-- Add customer email to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_email TEXT;

-- Add UPC snapshot to order items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS upc TEXT;

-- Fix banana: change from "by lb" to "by each"
UPDATE products
SET
  description = 'BANANAS',
  pkg_size    = 'EACH',
  uom         = 'EACH'
WHERE upc = '033300001008'
   OR (LOWER(description) LIKE '%banana%' AND LOWER(uom) = 'lb');
