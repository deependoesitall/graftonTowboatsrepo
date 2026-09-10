-- 073_push_subscriptions.sql
--
-- Web Push subscriptions for STAFF ONLY.
--
-- Email already tells GTS and Sinclair's about a new order and is not going
-- away. Push exists because email is slow to notice — a phone buzzing at 5am
-- gets a boat shopped sooner than a Gmail tab someone opens at eight.
--
-- ⚠️ NO CUSTOMER SUBSCRIPTIONS, EVER. Rows here are keyed to an admin session
-- subject (admin_users.id). There is no route that will write a row without a
-- verified admin session, and there is no code path that sends to a vessel.
-- A crew member on a barge should never get a push from us.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who this belongs to. Deliberately NOT a foreign key to admin_users: the
  -- push routes trust the signed session's `sub` claim, and a FK here would
  -- turn "the token names a user who was since deleted" into a 500 during a
  -- subscribe call rather than a row that simply stops being sent to.
  admin_user_id uuid NOT NULL,

  -- Snapshot of the role AT SUBSCRIBE TIME, used for fan-out targeting.
  -- Denormalised on purpose: sending is a hot path that runs inside the order
  -- POST, and it must not need a join to decide who gets what.
  -- Refreshed on every re-subscribe, which browsers do periodically.
  role          text NOT NULL,

  -- True for accounts scoped to Sinclair's (isSinclairScoped). Stored rather
  -- than derived so the send path can filter without importing auth logic.
  is_sinclair   boolean NOT NULL DEFAULT false,

  -- The push service URL. Globally unique per browser install — this is the
  -- natural key and the reason re-subscribing is an upsert, not an insert.
  -- Without the constraint, every app launch would add a duplicate row and
  -- staff would get the same notification four times.
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,

  -- Helps a human recognise their own devices in Settings ("iPhone", "Chrome
  -- on Windows") when they want to turn one off.
  user_agent    text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  last_sent_at  timestamptz,

  -- Set when the push service returns 404/410 (uninstalled, permission
  -- revoked, expired). Kept rather than deleted so a device that goes quiet is
  -- visibly dead instead of mysteriously absent.
  expired_at    timestamptz
);

-- The fan-out query: live subscriptions for a given audience.
CREATE INDEX IF NOT EXISTS idx_push_subs_live
  ON push_subscriptions (is_sinclair) WHERE expired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_push_subs_user
  ON push_subscriptions (admin_user_id);

-- Service-role only. The anon key must never read these: an endpoint URL is a
-- capability — anyone holding it plus the VAPID keys can push to that device.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subs_service_all ON push_subscriptions;
CREATE POLICY push_subs_service_all ON push_subscriptions
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

COMMENT ON TABLE push_subscriptions IS
  'Web Push endpoints for admin/shopper devices. Staff only — never customers. See migration 073.';

-- Check:
-- SELECT role, is_sinclair, count(*) FROM push_subscriptions
--  WHERE expired_at IS NULL GROUP BY 1,2;
