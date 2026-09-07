-- 068_contact_submissions.sql
--
-- Somewhere for the website contact form to land.
--
-- WHY STORE AND NOT JUST EMAIL.
-- Squarespace kept a copy of every form submission. If the replacement only
-- emails, then a Resend outage, a bounced address, or an over-eager spam filter
-- loses an enquiry SILENTLY — and nobody ever learns it existed, because there
-- is no record of a message that was never delivered. For a business whose
-- customers are barge lines deciding whether to try you, a lost enquiry is a
-- lost account.
--
-- So the row is the source of truth and the email is the notification. If the
-- email fails, the submission still succeeded and it's sitting here.

CREATE TABLE IF NOT EXISTS contact_submissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  email        text,
  phone        text,
  -- Vessel or company. Free text on purpose: a brand-new boat must be able to
  -- get in touch without existing in any list first.
  vessel       text,
  message      text NOT NULL,
  -- Did the notification email actually go out? NULL until attempted.
  emailed_at   timestamptz,
  email_error  text,
  -- Best-effort, for spotting abuse. Not used for anything else.
  ip           text,
  user_agent   text,
  -- Jen/Mary tick these off as they reply.
  handled      boolean NOT NULL DEFAULT false,
  handled_at   timestamptz,
  handled_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created
  ON contact_submissions (created_at DESC);
-- Partial index: the only query anyone runs day to day is "what still needs a
-- reply", and that set stays small even as the table grows.
CREATE INDEX IF NOT EXISTS idx_contact_submissions_unhandled
  ON contact_submissions (created_at DESC) WHERE handled = false;

-- RLS ON, no permissive policy for anon.
--
-- This one matters more than most: the table holds names, emails and phone
-- numbers of people who contacted the business. The anon key is public — it
-- ships in the browser bundle — so without RLS anyone could read every enquiry
-- GTS has ever received. Writes go through the API route using the service
-- role, which bypasses RLS entirely, so nothing legitimate needs anon access.
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_submissions_service_all ON contact_submissions;
CREATE POLICY contact_submissions_service_all ON contact_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE contact_submissions IS
  'Website contact form. Row is the source of truth; the notification email is best-effort. See src/app/api/site-contact/route.ts.';

-- Check — anything that came in but never got emailed:
-- SELECT created_at, name, coalesce(email, phone) AS reply_to, email_error
--   FROM contact_submissions
--  WHERE emailed_at IS NULL
--  ORDER BY created_at DESC;
