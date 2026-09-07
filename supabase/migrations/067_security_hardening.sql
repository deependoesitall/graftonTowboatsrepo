-- 067_security_hardening.sql
--
-- Three real holes found by auditing the schema, not a checklist sweep.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY "NO RLS" IS NOT A HARMLESS OVERSIGHT HERE
--
-- Supabase publishes every table in the `public` schema through PostgREST,
-- and the anon key that reaches it is NEXT_PUBLIC_SUPABASE_ANON_KEY — which,
-- by design, ships inside the JavaScript of the ordering site. It is public.
-- It is meant to be public.
--
-- What stops a stranger reading a table with that key is ROW LEVEL SECURITY.
-- A table with RLS switched off is readable and WRITEABLE by anyone who opens
-- devtools on graftontowboat.com and copies the key out of the bundle. Not
-- theoretical — that's the intended, documented behaviour of the platform.
--
-- Every table in this schema has RLS enabled except the two below.
-- ══════════════════════════════════════════════════════════════════════════


-- ── 1 ─ admin_sessions: a dead table, left open ──────────────────────────
--
-- Added in migration 012 for server-side session revocation (a `jti` denylist).
-- The app then moved to stateless JWTs held in sessionStorage and this table
-- was never wired up — nothing in src/ references it. It has sat there since
-- with RLS off.
--
-- An unused table is still an open door, and this one is shaped like session
-- identifiers, which is the worst possible thing to leave writable: anyone
-- could insert rows into it, and if session revocation is ever switched on
-- later it would start out already poisoned.
--
-- Dropped rather than secured. Dead code that holds security state is worse
-- than no code, because the next person to read migration 012 will reasonably
-- assume revocation works.
DROP TABLE IF EXISTS admin_sessions;


-- ── 2 ─ catalog_sync_state: writable by the public ───────────────────────
--
-- Holds the nightly Freshop sync's resume cursor. Nothing sensitive to READ —
-- but with RLS off it is also WRITEABLE, and a single UPDATE setting the
-- cursor to garbage would stall the catalogue sync silently. The store would
-- quietly stop updating and the first symptom would be Dave asking why prices
-- are stale.
--
-- Availability is a security property too.
ALTER TABLE catalog_sync_state ENABLE ROW LEVEL SECURITY;

-- No policy for anon/authenticated: with RLS on and no permissive policy, the
-- public key gets nothing. The cron job and every API route already use the
-- SERVICE ROLE, which bypasses RLS entirely — so this changes nothing about
-- how the app works, and everything about what a stranger can do.
DROP POLICY IF EXISTS catalog_sync_state_service_all ON catalog_sync_state;
CREATE POLICY catalog_sync_state_service_all ON catalog_sync_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 3 ─ Login throttling ─────────────────────────────────────────────────
--
-- THE ACTUAL RISK ON THIS APP.
--
-- Passwords are bcrypt-hashed with a per-password salt (src/lib/password.ts),
-- which is correct and means a stolen database doesn't hand over the
-- passwords. But bcrypt protects the STORED hash; it does nothing about
-- someone hammering the login form. /api/admin/auth accepts unlimited attempts
-- at whatever speed the network allows.
--
-- The admin panel holds every barge line's rates, every delivery, Sinclair's
-- receipts and the customers' contact details. The usernames are guessable
-- (they're first names). Passwords chosen by a small crew are rarely 20
-- characters of entropy. Unlimited guesses is the gap that matters, and it is
-- the cheapest one to close.
--
-- DESIGN: a lockout must never be a way to lock the real user OUT — Jen
-- getting stonewalled at 5am on a delivery morning is a worse outcome than a
-- slow brute force. So this counts FAILURES ONLY, expires them on a rolling
-- window, and clears the moment a correct password arrives.

CREATE TABLE IF NOT EXISTS login_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lowercased username, or '' for the legacy single-password login.
  username    text NOT NULL DEFAULT '',
  -- Best-effort client IP from the proxy headers. Spoofable, which is exactly
  -- why the username counter exists alongside it: an attacker can rotate IPs
  -- but cannot avoid naming the account they're guessing at.
  ip          text NOT NULL DEFAULT '',
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts (username, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip       ON login_attempts (ip, attempted_at DESC);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS login_attempts_service_all ON login_attempts;
CREATE POLICY login_attempts_service_all ON login_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE login_attempts IS
  'Failed admin logins, rolling window. Successful logins clear the row set. See src/lib/login-throttle.ts.';

/**
 * How many failures in the window, for this username and this IP.
 *
 * SECURITY DEFINER so it runs with the owner's rights: the API calls it
 * through the service role anyway, but pinning search_path stops a schema
 * shadowing trick from redirecting the table lookup.
 */
CREATE OR REPLACE FUNCTION public.recent_login_failures(
  p_username text,
  p_ip text,
  p_window_minutes int DEFAULT 15
)
RETURNS TABLE (by_username int, by_ip int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    count(*) FILTER (WHERE username = lower(btrim(coalesce(p_username, ''))))::int,
    count(*) FILTER (WHERE ip = coalesce(p_ip, '') AND coalesce(p_ip, '') <> '')::int
  FROM login_attempts
  WHERE attempted_at > now() - make_interval(mins => p_window_minutes);
$fn$;

/** Housekeeping — the window is 15 minutes, so anything past a day is litter. */
CREATE OR REPLACE FUNCTION public.prune_login_attempts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  DELETE FROM login_attempts WHERE attempted_at < now() - interval '1 day';
$fn$;


-- Check:
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE schemaname = 'public' AND rowsecurity = false;
-- (should return zero rows)
