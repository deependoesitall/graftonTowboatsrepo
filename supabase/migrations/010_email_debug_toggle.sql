-- ============================================================
-- Migration 010: Add email debug toggle to admin_settings
-- Lets owners temporarily enable a diagnostic toast on the
-- order page showing email send success/failure. Default OFF.
-- Safe to re-run.
-- ============================================================

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS email_debug_enabled BOOLEAN DEFAULT FALSE;
