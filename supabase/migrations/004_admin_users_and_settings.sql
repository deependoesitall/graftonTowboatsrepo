-- ============================================================
-- Migration 004: Admin Users, Roles, and Settings Persistence
-- Run in Supabase SQL Editor
-- ============================================================

-- Admin users table (supports multiple admins with roles)
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff'
                  CHECK (role IN ('owner', 'manager', 'staff')),
  display_name  TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for admin_users
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_users_service_all" ON admin_users
  FOR ALL USING (auth.role() = 'service_role');

-- Trigger
CREATE TRIGGER update_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add admin_settings columns for password management
ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS admin_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS repeat_orders_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS order_email_subject TEXT DEFAULT 'New Order #{order_number} — {company_name}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Trigger for admin_settings
CREATE TRIGGER update_admin_settings_updated_at
  BEFORE UPDATE ON admin_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Customer favorites table
CREATE TABLE IF NOT EXISTS customer_favorites (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_session ON customer_favorites(session_id);

ALTER TABLE customer_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favorites_service_all" ON customer_favorites
  FOR ALL USING (auth.role() = 'service_role');

-- Add session_id to orders for repeat order feature
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);
