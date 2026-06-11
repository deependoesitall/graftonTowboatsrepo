-- ============================================================
-- Migration 008: Auth Hardening Notes
-- Run in Supabase SQL Editor
--
-- No destructive schema changes are required for the JWT/bcrypt auth
-- upgrade — `admin_users.password_hash` and
-- `admin_settings.admin_password_hash` are TEXT columns that already
-- accommodate both the old 64-character SHA-256 hex digests and new
-- ~60-character bcrypt hashes ($2a$/$2b$ prefix).
--
-- Existing accounts are upgraded transparently: the next time each user
-- logs in successfully, the app detects the legacy SHA-256 hash and
-- re-hashes the password with bcrypt automatically (see
-- src/lib/password.ts and src/app/api/admin/auth/route.ts).
--
-- This migration just adds an optional tracking column so you can see
-- in the admin_users table which accounts have been upgraded.
-- ============================================================

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS password_algo TEXT DEFAULT 'sha256_legacy';

-- Backfill: any row whose hash already looks like bcrypt should be marked.
UPDATE admin_users
SET password_algo = 'bcrypt'
WHERE password_hash LIKE '$2%';

-- Optional: same tracking for the legacy single-password hash in admin_settings.
ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS admin_password_algo TEXT DEFAULT 'sha256_legacy';

UPDATE admin_settings
SET admin_password_algo = 'bcrypt'
WHERE admin_password_hash LIKE '$2%';
