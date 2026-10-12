-- Newsletters, the contact list, and per-recipient sends.
--
-- ONE MODEL: every email Jen sends to a list is a send of some newsletter.
-- The announcement is just a newsletter: 'branded' and 'plain' are its two
-- built-in copies, other newsletters are rows in `newsletters`. A send is an
-- email_imports row pinned to one copy when it's made (newsletter_key:
-- 'branded', 'plain' or a newsletter id), its recipients are email_import_recipients
-- rows, and the existing queue sends them within the daily Resend limit.
-- Additive only.

CREATE TABLE IF NOT EXISTS newsletters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  subject         text NOT NULL,
  body            text NOT NULL,
  style           text NOT NULL DEFAULT 'plain' CHECK (style IN ('plain', 'branded')),
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  archived        boolean NOT NULL DEFAULT false
);
ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;  -- service role only

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS announcement_version text NOT NULL DEFAULT 'branded';

-- Which email a send is. Every send so far is the Branded announcement.
ALTER TABLE email_imports
  ADD COLUMN IF NOT EXISTS newsletter_key text NOT NULL DEFAULT 'branded';  -- every existing send (the 46 waiting included) stays on Branded

ALTER TABLE email_import_recipients
  ADD COLUMN IF NOT EXISTS resend_email_id text;
CREATE INDEX IF NOT EXISTS email_import_recipients_resend_email_id_idx
  ON email_import_recipients (resend_email_id) WHERE resend_email_id IS NOT NULL;

-- The contact list. One row per address (lowercase).
CREATE TABLE IF NOT EXISTS email_contacts (
  email         text PRIMARY KEY CHECK (email = lower(email)),
  name          text,
  company       text,
  vessel        text,
  user_id       uuid,                     -- the customer login with this address, if any
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('imported', 'sign-up', 'manual')),
  status        text NOT NULL DEFAULT 'subscribed'
                CHECK (status IN ('subscribed', 'unsubscribed', 'bounced', 'suppressed')),
  status_reason text,
  status_at     timestamptz,
  added_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE email_contacts ENABLE ROW LEVEL SECURITY;  -- service role only
CREATE INDEX IF NOT EXISTS email_contacts_status_idx ON email_contacts (status);

-- Seed: customer logins first (they carry a name and boat), then everyone
-- already on an announcement list.
INSERT INTO email_contacts (email, name, company, vessel, user_id, source, added_at)
SELECT DISTINCT ON (lower(u.email))
       lower(u.email),
       NULLIF(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
       coalesce(c.name, p.company_name),
       coalesce(v.name, p.vessel_name),
       u.id, 'sign-up', u.created_at
FROM auth.users u
LEFT JOIN customer_profiles p ON p.user_id = u.id
LEFT JOIN vessel_members m ON m.user_id = u.id
LEFT JOIN vessels v ON v.id = m.vessel_id
LEFT JOIN companies c ON c.id = v.company_id
WHERE u.email IS NOT NULL
ORDER BY lower(u.email), m.created_at
ON CONFLICT (email) DO NOTHING;

INSERT INTO email_contacts (email, source, added_at)
SELECT lower(r.email), 'imported', min(i.created_at)
FROM email_import_recipients r JOIN email_imports i ON i.id = r.import_id
WHERE r.status <> 'invalid'
GROUP BY lower(r.email)
ON CONFLICT (email) DO NOTHING;

-- Bounces and Resend suppressions already known.
UPDATE email_contacts c SET status = 'bounced', status_reason = r.error, status_at = coalesce(r.failed_at, now())
FROM email_import_recipients r
WHERE r.status = 'failed' AND lower(r.email) = c.email AND c.status = 'subscribed';

INSERT INTO email_contacts (email, source, status, status_reason, status_at, added_at)
SELECT lower(email), 'imported', 'suppressed', reason, created_at, created_at FROM email_suppressions
ON CONFLICT (email) DO UPDATE
  SET status = CASE WHEN email_contacts.status = 'unsubscribed' THEN email_contacts.status ELSE 'suppressed' END,
      status_reason = coalesce(email_contacts.status_reason, EXCLUDED.status_reason),
      status_at = coalesce(email_contacts.status_at, EXCLUDED.status_at);

-- Repeating or later sends of one newsletter. The email-queue job (every 15
-- min) turns a due schedule into a send in the same daily-limited queue.
CREATE TABLE IF NOT EXISTS newsletter_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_key  text NOT NULL,
  audience        jsonb NOT NULL DEFAULT '{}'::jsonb,
  kind            text NOT NULL CHECK (kind IN ('once', 'weekly', 'biweekly')),
  next_at         timestamptz,
  paused          boolean NOT NULL DEFAULT false,
  last_sent_at    timestamptz,
  last_import_id  uuid,
  last_error      text,
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS newsletter_schedules_due ON newsletter_schedules (next_at) WHERE NOT paused;
ALTER TABLE newsletter_schedules ENABLE ROW LEVEL SECURITY;
