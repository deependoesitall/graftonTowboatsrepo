-- Email builder: newsletters made of blocks (text, picture, button, line,
-- and an imported design kept as is), pictures hosted in a public bucket,
-- and click counts per button. Additive only: every existing newsletter
-- stays a text newsletter (format 'text'), Plain and Branded are untouched.

ALTER TABLE newsletters
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'text' CHECK (format IN ('text', 'blocks')),
  ADD COLUMN IF NOT EXISTS blocks jsonb,
  -- Send a text-only copy instead (reads like a personal email).
  ADD COLUMN IF NOT EXISTS send_plain boolean NOT NULL DEFAULT false;

-- Pictures used in emails. Public so every inbox can load them.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('email-images', 'email-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Everything Resend reports about each sent email, for the stats view:
-- delivered, opened, clicked (with the link), bounced, complained, plus our
-- own unsubscribes. Opens and clicks need tracking turned on for the sending
-- domain and those webhook events subscribed; both are off until approved.
CREATE TABLE IF NOT EXISTS email_events (
  id              bigserial PRIMARY KEY,
  type            text NOT NULL CHECK (type IN ('delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed')),
  resend_email_id text,
  newsletter_key  text,
  import_id       uuid,
  email           text,
  link            text,
  at              timestamptz NOT NULL DEFAULT now(),
  -- Resend retries webhooks; the same event lands once.
  dedupe          text UNIQUE
);
CREATE INDEX IF NOT EXISTS email_events_import_idx ON email_events (import_id, type);
CREATE INDEX IF NOT EXISTS email_events_key_idx ON email_events (newsletter_key, type);
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;  -- service role only
