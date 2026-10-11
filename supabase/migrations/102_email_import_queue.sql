-- Announcement queue: Jen pastes a list once, today's Resend quota goes out
-- right away and the rest goes out a day at a time at the time she picks.
--
-- A pg_cron job pings /api/cron/email-queue every 15 minutes. The route does
-- nothing until Jen has saved a daily send time on the Emails tab (there is no
-- default, so nothing goes out on its own), and after that only once a day:
-- past that time (America/Chicago) and when today's batch has not run. The shared secret lives in Vault as
-- 'email_queue_secret' (created outside this file, never committed) and in
-- Vercel as EMAIL_QUEUE_SECRET.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS email_imports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  template        text NOT NULL DEFAULT 'announcement' CHECK (template IN ('announcement')),
  subject         text,
  total           integer NOT NULL DEFAULT 0,
  sent_count      integer NOT NULL DEFAULT 0,
  invalid         jsonb NOT NULL DEFAULT '[]'::jsonb,
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'sending', 'paused', 'done', 'cancelled')),
  last_run_at     timestamptz,
  last_error      text
);

CREATE INDEX IF NOT EXISTS email_imports_created_at_idx ON email_imports (created_at);

CREATE TABLE IF NOT EXISTS email_import_recipients (
  id        bigserial PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES email_imports(id) ON DELETE CASCADE,
  email     text NOT NULL,
  status    text NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'sent', 'failed', 'invalid', 'skipped')),
  sent_at   timestamptz,
  error     text,
  UNIQUE (import_id, email)
);

CREATE INDEX IF NOT EXISTS email_import_recipients_status_idx ON email_import_recipients (import_id, status);
CREATE INDEX IF NOT EXISTS email_import_recipients_sent_email_idx ON email_import_recipients (email) WHERE status = 'sent';

-- Server only. The admin app talks to these through the service role.
ALTER TABLE email_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_import_recipients ENABLE ROW LEVEL SECURITY;

-- Counts per import for the history list, so the page never pulls every row.
CREATE OR REPLACE VIEW email_import_counts WITH (security_invoker = true) AS
  SELECT import_id,
         count(*) FILTER (WHERE status = 'pending') AS pending,
         count(*) FILTER (WHERE status = 'sent')    AS sent,
         count(*) FILTER (WHERE status = 'failed')  AS failed,
         count(*) FILTER (WHERE status = 'invalid') AS invalid,
         count(*) FILTER (WHERE status = 'skipped') AS skipped
    FROM email_import_recipients
   GROUP BY import_id;

REVOKE ALL ON email_imports, email_import_recipients, email_import_counts FROM anon, authenticated;

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS email_queue_send_time time,
  ADD COLUMN IF NOT EXISTS email_queue_last_run_on date;

COMMENT ON COLUMN admin_settings.email_queue_send_time IS
  'Daily time (America/Chicago) the queued announcement batch goes out. NULL until Jen sets it: nothing is sent from the queue before then.';
COMMENT ON COLUMN admin_settings.email_queue_last_run_on IS
  'Chicago date the daily announcement batch last ran. Claimed atomically so two pings cannot both send.';

-- Every 15 minutes. The route decides whether there is anything to do.
SELECT cron.unschedule('email-queue') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-queue');
SELECT cron.schedule(
  'email-queue',
  '*/15 * * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://graftontowboatservices.com/api/cron/email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-email-queue-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_secret' LIMIT 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
