-- Bounces and spam complaints reported by Resend's webhook
-- (/api/webhooks/resend). A queued address that bounced is marked failed
-- with the reason and time, and is never sent the announcement again.

ALTER TABLE email_import_recipients
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

-- Every address Resend has suppressed (hard bounce, complaint, manual),
-- so a later list skips it even if it was never in a list before.
CREATE TABLE IF NOT EXISTS email_suppressions (
  email      text PRIMARY KEY,
  origin     text NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON email_suppressions FROM anon, authenticated;
