// src/app/api/admin/auth/route.ts
//
// Admin login. On success, returns a signed JWT in the response body —
// the client stores it in sessionStorage (die on close) or localStorage
// when `remember` is true. An httpOnly cookie is set only for remembered
// sessions (30d); short sessions stay Bearer + sessionStorage only.
//
// Supports two login modes:
//   - Multi-user: { username, password } -> checks admin_users table
//   - Legacy single-password: { password } -> checks admin_settings.admin_password_hash,
//     falling back to ADMIN_PASSWORD env var if no hash has been set yet.
//
// MIGRATION: if the matched user's stored hash is an old SHA-256 hash,
// it is transparently re-hashed with bcrypt and saved on this successful
// login (see src/lib/password.ts for details).

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hashPassword, verifyPassword, isLegacyHash } from '@/lib/password';
import { signAdminSession, sessionCookieOptions, clearedCookieOptions, SESSION_COOKIE, AdminRole, AdminPermission } from '@/lib/admin-auth-server';
import { throttleLogin, recordLoginFailure, clearLoginFailures, clientIp } from '@/lib/login-throttle';

/**
 * A valid bcrypt hash of a value nobody knows, used only to burn the same
 * ~100ms a real password check costs when the username doesn't exist. It can
 * never match: bcrypt is one-way and this is the hash of a random string.
 */
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export async function POST(req: NextRequest) {
  let body: { password?: string; username?: string; remember?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { password, username } = body;
  // Default ON — dock/shop phones expect to stay signed in across closes.
  const remember = body.remember !== false;
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const ip = clientIp(req.headers);

  // Pay the accumulated delay BEFORE touching the password. Doing it first
  // means a wrong guess costs the same whether or not the account exists, so
  // the response time never reveals which usernames are real.
  await throttleLogin(supabase, username || '', ip);

  // ----- Multi-user login -----
  if (username) {
    const { data: user } = await supabase
      .from('admin_users')
      .select('id, username, role, display_name, password_hash, is_active, permissions')
      .eq('username', username.toLowerCase().trim())
      .eq('is_active', true)
      .single();

    // Generic error message regardless of whether the username or
    // password was wrong, to avoid username enumeration.
    const genericError = NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });

    if (!user) {
      // TIMING ORACLE, CLOSED. Returning here immediately used to answer in a
      // millisecond, while a REAL username spent ~100ms inside bcrypt. That
      // gap is measurable over a few requests, so the generic error message
      // above was telling the truth while the clock gave it away — you could
      // enumerate every admin username without ever guessing a password.
      // Burning one bcrypt against a throwaway hash makes both paths cost the
      // same. The result is discarded; only the elapsed time matters.
      await verifyPassword(password, DUMMY_HASH);
      await recordLoginFailure(supabase, username, ip);
      return genericError;
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      await recordLoginFailure(supabase, username, ip);
      return genericError;
    }
    await clearLoginFailures(supabase, username);

    // Transparent upgrade: re-hash with bcrypt if this was a legacy SHA-256 hash.
    if (isLegacyHash(user.password_hash)) {
      const upgraded = await hashPassword(password);
      await supabase.from('admin_users').update({ password_hash: upgraded }).eq('id', user.id);
    }

    await supabase.from('admin_users').update({ last_login: new Date().toISOString() }).eq('id', user.id);

    const role = user.role as AdminRole;
    const permissions: AdminPermission[] = Array.isArray(user.permissions)
      ? (user.permissions as string[]).filter((p): p is AdminPermission => p === 'sinclair')
      : [];
    const token = signAdminSession({
      sub: user.id,
      username: user.username,
      role,
      display_name: user.display_name || user.username,
      permissions,
    }, { remember });

    const res = NextResponse.json({
      token,
      remember,
      user: { username: user.username, role, display_name: user.display_name, permissions },
    });
    if (remember) {
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions({ remember: true }));
    } else {
      // Die-on-close: no persistent cookie — sessionStorage + short JWT only.
      res.cookies.set(SESSION_COOKIE, '', clearedCookieOptions());
    }
    return res;
  }

  // ----- Legacy single-password login -----
  const { data: settings } = await supabase
    .from('admin_settings')
    .select('admin_password_hash')
    .single();

  const storedHash = settings?.admin_password_hash as string | null | undefined;
  const genericError = NextResponse.json({ error: 'Invalid password' }, { status: 401 });

  let valid = false;
  if (storedHash) {
    valid = await verifyPassword(password, storedHash);
    if (valid && isLegacyHash(storedHash)) {
      const upgraded = await hashPassword(password);
      const { data: row } = await supabase.from('admin_settings').select('id').single();
      if (row?.id) {
        await supabase.from('admin_settings').update({ admin_password_hash: upgraded }).eq('id', row.id);
      }
    }
  } else {
    // No password has ever been set in Supabase yet — fall back to the
    // ADMIN_PASSWORD environment variable. There is NO hardcoded default;
    // if ADMIN_PASSWORD is unset, login fails closed.
    const envPassword = process.env.ADMIN_PASSWORD;
    if (envPassword && password === envPassword) {
      valid = true;
      // Persist a bcrypt hash so subsequent logins don't depend on the env var
      // and so the password can be changed via the admin Settings page.
      const hashed = await hashPassword(password);
      const { data: row } = await supabase.from('admin_settings').select('id').single();
      if (row?.id) {
        await supabase.from('admin_settings').update({ admin_password_hash: hashed }).eq('id', row.id);
      }
    }
  }

  if (!valid) {
    // The legacy path has no username, so failures are counted under '' — the
    // IP counter is what actually throttles it. Recorded all the same, so a
    // burst against this endpoint still slows itself down.
    await recordLoginFailure(supabase, '', ip);
    return genericError;
  }
  await clearLoginFailures(supabase, '');

  const token = signAdminSession({
    sub: 'admin',
    username: 'admin',
    role: 'owner',
    display_name: 'Jennifer',
    permissions: [],
  }, { remember });

  const res = NextResponse.json({
    token,
    remember,
    user: { username: 'admin', role: 'owner', display_name: 'Jennifer', permissions: [] },
  });
  if (remember) {
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions({ remember: true }));
  } else {
    res.cookies.set(SESSION_COOKIE, '', clearedCookieOptions());
  }
  return res;
}
