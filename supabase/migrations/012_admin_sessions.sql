-- ============================================================
-- Migration 012: Server-tracked admin sessions
-- Run in Supabase SQL Editor
--
-- Enables true "close the tab/browser = logged out" behavior for the
-- admin panel. The JWT cookie alone can't be revoked, so we track each
-- login as a row here. The client sends a beacon to /api/admin/logout
-- on pagehide/beforeunload, which deletes the row. Every authenticated
-- request (/api/admin/me and requireAdmin) checks the row still exists.
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jti TEXT NOT NULL UNIQUE,           -- JWT id, embedded as `jti` claim
  admin_user_id TEXT NOT NULL,        -- admin_users.id, or 'admin' for legacy login
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_jti ON admin_sessions (jti);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions (expires_at);
