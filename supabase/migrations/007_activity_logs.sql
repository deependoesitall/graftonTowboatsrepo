-- ============================================================
-- Migration 007: Admin Activity Logs
-- Tracks order status changes (and other admin actions) with
-- the admin user who performed them. Owner-only visibility.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID REFERENCES orders(id) ON DELETE CASCADE,
  order_number    TEXT,
  action          TEXT NOT NULL,            -- e.g. 'status_change'
  from_value      TEXT,                     -- e.g. previous status
  to_value        TEXT,                     -- e.g. new status
  admin_username  TEXT,                     -- e.g. 'jennifer'
  admin_display_name TEXT,                  -- e.g. 'Jennifer'
  admin_role      TEXT,                     -- e.g. 'owner' | 'manager' | 'staff'
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_order_id ON activity_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_service_all" ON activity_logs;
CREATE POLICY "activity_logs_service_all" ON activity_logs
  FOR ALL USING (auth.role() = 'service_role');
