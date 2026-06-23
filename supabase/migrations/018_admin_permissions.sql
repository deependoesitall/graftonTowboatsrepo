-- 018_admin_permissions.sql
-- Adds a permissions column to admin_users to support fine-grained
-- capability flags (e.g. 'sinclair') layered on top of the base role tier.
--
-- Role (owner/manager/staff) controls which admin sections are accessible.
-- Permissions are additive flags that further scope what a user sees/can do
-- within those sections.
--
-- Apply in Supabase SQL editor or via CLI:
--   supabase db push  (if using local dev)
--   or paste into the Supabase dashboard SQL editor

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN admin_users.permissions IS
  'Additive capability flags layered on top of role. Current values: sinclair (scopes order/shopping access to grocery items only).';
