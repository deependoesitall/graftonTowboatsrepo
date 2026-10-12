-- Announcement versions: which copy the queue sends, custom copies written on
-- the Emails tab, and the Resend email id of each per-recipient send.
-- Additive only. The selected version defaults to the current branded email.
CREATE TABLE IF NOT EXISTS email_announcement_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  subject         text NOT NULL,
  body            text NOT NULL,
  format          text NOT NULL DEFAULT 'text' CHECK (format IN ('text', 'html')),
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived        boolean NOT NULL DEFAULT false
);
ALTER TABLE email_announcement_versions ENABLE ROW LEVEL SECURITY;  -- service role only

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS announcement_version text NOT NULL DEFAULT 'branded';

ALTER TABLE email_import_recipients
  ADD COLUMN IF NOT EXISTS resend_email_id text;
CREATE INDEX IF NOT EXISTS email_import_recipients_resend_email_id_idx
  ON email_import_recipients (resend_email_id) WHERE resend_email_id IS NOT NULL;
