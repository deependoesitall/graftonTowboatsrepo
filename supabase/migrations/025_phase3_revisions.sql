-- 025_phase3_revisions.sql
-- Schema changes for the July 2026 revision round (Zoom demo feedback):
--   1. crew_change: boolean -> text tri-state ('yes' | 'no' | 'maybe') + optional notes
--   2. products.billed_by_weight flag (per-pound items like bananas)
--   3. admin_settings: weekly ad URL + order cutoff buffers
--   4. coupons table (display-only coupons, managed by Sinclair manager)
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE CHANGES.

-- ============================================================
-- 1. Crew change tri-state
-- ============================================================
ALTER TABLE orders
  ALTER COLUMN crew_change DROP DEFAULT;

ALTER TABLE orders
  ALTER COLUMN crew_change TYPE TEXT
  USING CASE WHEN crew_change THEN 'yes' ELSE 'no' END;

ALTER TABLE orders
  ALTER COLUMN crew_change SET DEFAULT 'no',
  ALTER COLUMN crew_change SET NOT NULL;

ALTER TABLE orders
  ADD CONSTRAINT orders_crew_change_check
  CHECK (crew_change IN ('yes', 'no', 'maybe'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS crew_change_notes TEXT;

-- ============================================================
-- 2. Billed-by-weight products
-- ============================================================
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS billed_by_weight BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: items already sold per pound are billed by weight.
UPDATE products SET billed_by_weight = TRUE WHERE UPPER(COALESCE(uom, '')) = 'LB';

-- ============================================================
-- 3. Admin settings: weekly ad + order cutoff buffers
-- ============================================================
ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS weekly_ad_url TEXT DEFAULT '',
  -- Hours before ETA after which new GROCERY orders are blocked. 0 = disabled.
  ADD COLUMN IF NOT EXISTS grocery_cutoff_hours NUMERIC(5, 1) NOT NULL DEFAULT 4,
  -- Separate buffer for crew-change / additional-services-only orders. 0 = disabled.
  ADD COLUMN IF NOT EXISTS service_cutoff_hours NUMERIC(5, 1) NOT NULL DEFAULT 2;

-- ============================================================
-- 4. Coupons (display-only — savings applied by Sinclair's at fulfillment)
-- ============================================================
CREATE TABLE IF NOT EXISTS coupons (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL,
  description    TEXT,
  -- 'amount' = dollars off, 'percent' = % off, 'other' = free-text deal ("2 for $5")
  discount_type  TEXT NOT NULL DEFAULT 'amount'
                   CHECK (discount_type IN ('amount', 'percent', 'other')),
  discount_value NUMERIC(10, 2),          -- null allowed for 'other'
  discount_text  TEXT,                    -- shown verbatim for 'other'
  applies_to     TEXT NOT NULL DEFAULT 'all'
                   CHECK (applies_to IN ('all', 'category', 'products')),
  category       TEXT,                    -- when applies_to = 'category'
  product_ids    UUID[] DEFAULT '{}',     -- when applies_to = 'products'
  starts_at      DATE,
  expires_at     DATE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     TEXT,                    -- admin username
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons (is_active, expires_at);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- Public (anon) can read active, unexpired coupons for catalog display.
DROP POLICY IF EXISTS coupons_public_read ON coupons;
CREATE POLICY coupons_public_read ON coupons
  FOR SELECT
  USING (is_active AND (expires_at IS NULL OR expires_at >= CURRENT_DATE));

-- Writes go through the service-role API only (admin routes), same as products.
