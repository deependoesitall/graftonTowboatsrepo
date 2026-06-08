-- ============================================================
-- Grafton Towboat Services — Supabase Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category    TEXT NOT NULL DEFAULT 'General',
  sub_category TEXT,
  upc         TEXT,
  description TEXT NOT NULL,
  pkg_size    TEXT,
  uom         TEXT,
  price       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast search
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_description ON products USING gin(to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS idx_products_active ON products (is_active);
CREATE INDEX IF NOT EXISTS idx_products_upc ON products (upc) WHERE upc IS NOT NULL;

-- ============================================================
-- ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number  TEXT NOT NULL UNIQUE,
  company_name  TEXT NOT NULL,
  contact_name  TEXT NOT NULL,
  phone         TEXT NOT NULL,
  po_number     TEXT,
  notes         TEXT,
  eta           TEXT,
  subtotal      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'in_progress', 'fulfilled', 'cancelled')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_company_name ON orders (company_name);

-- ============================================================
-- ORDER ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
  description  TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'General',
  pkg_size     TEXT,
  uom          TEXT,
  unit_price   NUMERIC(10, 2) NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  line_total   NUMERIC(10, 2) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);

-- ============================================================
-- ADMIN SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_settings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_email        TEXT NOT NULL DEFAULT 'GraftonTowboatServices@gmail.com',
  order_email_cc        TEXT,
  tax_rate              NUMERIC(5, 4) DEFAULT 0,
  tax_enabled           BOOLEAN DEFAULT FALSE,
  draft_orders_enabled  BOOLEAN DEFAULT TRUE,
  custom_fields         JSONB DEFAULT '[]'::JSONB,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO admin_settings (business_email, custom_fields)
VALUES (
  'GraftonTowboatServices@gmail.com',
  '[
    {"id":"1","label":"Company / Vessel Name","key":"company_name","type":"text","required":true,"enabled":true,"order":1},
    {"id":"2","label":"Contact Person Name","key":"contact_name","type":"text","required":true,"enabled":true,"order":2},
    {"id":"3","label":"Phone Number","key":"phone","type":"text","required":true,"enabled":true,"order":3},
    {"id":"4","label":"PO Number","key":"po_number","type":"text","required":false,"enabled":true,"order":4},
    {"id":"5","label":"Vessel ETA","key":"eta","type":"text","required":false,"enabled":true,"order":5},
    {"id":"6","label":"Special Instructions","key":"notes","type":"textarea","required":false,"enabled":true,"order":6}
  ]'::JSONB
) ON CONFLICT DO NOTHING;

-- ============================================================
-- HELPER FUNCTION: Category counts for filter sidebar
-- ============================================================
CREATE OR REPLACE FUNCTION get_category_counts()
RETURNS TABLE(category TEXT, count BIGINT) AS $$
  SELECT category, COUNT(*) as count
  FROM products
  WHERE is_active = TRUE
  GROUP BY category
  ORDER BY category;
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Products: public read, service role write
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_public_read" ON products
  FOR SELECT USING (is_active = TRUE);
CREATE POLICY "products_service_all" ON products
  FOR ALL USING (auth.role() = 'service_role');

-- Orders: service role only (customers submit via API, not direct)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_service_all" ON orders
  FOR ALL USING (auth.role() = 'service_role');

-- Order items: service role only
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_service_all" ON order_items
  FOR ALL USING (auth.role() = 'service_role');

-- Admin settings: service role only
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_service_all" ON admin_settings
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
