-- ============================================================
-- Migration 008: Add denormalized order details to activity_logs
-- so logs remain fully searchable even after an order is deleted.
-- Safe to re-run.
-- ============================================================

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS po_number TEXT;

CREATE INDEX IF NOT EXISTS idx_activity_logs_company_name ON activity_logs(company_name);
CREATE INDEX IF NOT EXISTS idx_activity_logs_contact_name ON activity_logs(contact_name);
