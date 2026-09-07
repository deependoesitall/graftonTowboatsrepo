// src/lib/login-throttle.ts
//
// Slows down password guessing on the admin login without ever locking out
// the crew.
//
// THE THREAT: /api/admin/auth accepted unlimited attempts. Usernames here are
// first names, and the panel behind them holds every barge line's rates, the
// delivery ledger, Sinclair's receipts and customer contact details. bcrypt
// protects the stored hashes; nothing was protecting the front door.
//
// THE CONSTRAINT: Jen at 5am with a boat waiting must never be the person this
// stops. A hard lockout would eventually do exactly that — someone fat-fingers
// a password five times and is then locked out of the system during a
// delivery, which is a worse day than the attack we're preventing.
//
// SO: a DELAY, not a lock. Failures buy the attacker a longer and longer wait;
// a correct password clears the slate instantly. At the top of the scale a
// human waits eight seconds and shrugs. A script trying a dictionary gets
// roughly 7 guesses an hour instead of thousands a second, which is the
// difference between "feasible" and "not".
//
// Counting happens in Postgres rather than in memory because every Vercel
// invocation is a fresh process — an in-memory counter would reset on almost
// every request and protect nothing.

import { SupabaseClient } from '@supabase/supabase-js';

/** Failures older than this stop counting. */
const WINDOW_MINUTES = 15;

/**
 * Delay applied BEFORE checking the password, by failure count in the window.
 * The first three are free — that's the normal "which password was it" range,
 * and punishing it would train people to distrust the login.
 */
const DELAY_LADDER_MS = [0, 0, 0, 500, 1_000, 2_000, 4_000, 8_000];
const MAX_DELAY_MS = 8_000;

/**
 * Client IP, best effort. Vercel sets x-forwarded-for; the leftmost entry is
 * the client. Spoofable — which is why the username counter matters more.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0]?.trim();
  return first || headers.get('x-real-ip')?.trim() || '';
}

function delayFor(failures: number): number {
  if (failures <= 0) return 0;
  return DELAY_LADDER_MS[Math.min(failures, DELAY_LADDER_MS.length - 1)] ?? MAX_DELAY_MS;
}

/**
 * Wait out whatever this username/IP has earned. Call BEFORE verifying the
 * password, so a wrong guess costs the attacker the delay whether or not the
 * account exists — otherwise the response time itself tells them which
 * usernames are real.
 *
 * Returns the delay applied, for logging.
 */
export async function throttleLogin(
  supabase: SupabaseClient,
  username: string,
  ip: string,
): Promise<number> {
  let failures = 0;
  try {
    const { data } = await supabase.rpc('recent_login_failures', {
      p_username: (username || '').toLowerCase().trim(),
      p_ip: ip,
      p_window_minutes: WINDOW_MINUTES,
    });
    const row = Array.isArray(data) ? data[0] : data;
    failures = Math.max(Number(row?.by_username ?? 0), Number(row?.by_ip ?? 0));
  } catch {
    // FAIL OPEN, DELIBERATELY. If the throttle table is unreachable the login
    // still works. Locking the crew out of the admin panel because a
    // housekeeping query failed would be a self-inflicted outage, and the
    // password check itself is unaffected.
    return 0;
  }

  const ms = delayFor(failures);
  if (ms > 0) await new Promise(r => setTimeout(r, ms));
  return ms;
}

/** Record a failure. Never throws — a login must not 500 over bookkeeping. */
export async function recordLoginFailure(
  supabase: SupabaseClient,
  username: string,
  ip: string,
): Promise<void> {
  try {
    await supabase.from('login_attempts').insert({
      username: (username || '').toLowerCase().trim(),
      ip,
    });
  } catch { /* bookkeeping only */ }
}

/**
 * Clear the slate on a correct password.
 *
 * Clears by USERNAME, not by IP: an attacker guessing Jen's password from
 * elsewhere must not have their counter wiped just because Jen happened to log
 * in successfully from the office. The person who proved they know the
 * password gets their own delay reset, and nobody else's.
 */
export async function clearLoginFailures(
  supabase: SupabaseClient,
  username: string,
): Promise<void> {
  try {
    await supabase.from('login_attempts')
      .delete()
      .eq('username', (username || '').toLowerCase().trim());
    // Cheap opportunistic housekeeping, on the rare successful-login path.
    await supabase.rpc('prune_login_attempts');
  } catch { /* bookkeeping only */ }
}
