-- ============================================================
-- Migration 006: Add first/last name to customer profiles
-- Safe to re-run
-- ============================================================

ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;
