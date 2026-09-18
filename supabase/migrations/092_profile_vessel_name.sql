-- ============================================================
-- Migration 092: Preferred vessel on customer_profiles
-- Company and vessel are separate (mirrors admin + checkout).
-- Safe to re-run.
-- ============================================================

ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS vessel_name TEXT;

COMMENT ON COLUMN customer_profiles.vessel_name IS
  'Preferred vessel for checkout autofill. Separate from company_name — one company can have many boats.';
