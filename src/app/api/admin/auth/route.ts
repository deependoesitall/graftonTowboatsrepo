// src/app/api/admin/auth/route.ts
//
// Admin login. On success, sets an httpOnly/Secure/SameSite=Strict
// session cookie containing a signed JWT. The token itself is NEVER
// returned in the response body — the client only receives non-secret
// display info (username, role, display name).
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
import { signAdminSession, sessionCookieOptions, SESSION_COOKIE, AdminRole } from '@/lib/admin-auth-server';

export async function POST(req: NextRequest) {
  let body: { password?: string; username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { password, username } = body;
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // ----- Multi-user login -----
  if (username) {
    const { data: user } = await supabase
      .from('admin_users')
      .select('id, username, role, display_name, password_hash, is_active')
      .eq('username', username.toLowerCase().trim())
      .eq('is_active', true)
      .single();

    // Generic error message regardless of whether the username or
    // password was wrong, to avoid username enumeration.
    const genericError = NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });

    if (!user) return genericError;

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return genericError;

    // Transparent upgrade: re-hash with bcrypt if this was a legacy SHA-256 hash.
    if (isLegacyHash(user.password_hash)) {
      const upgraded = await hashPassword(password);
      await supabase.from('admin_users').update({ password_hash: upgraded }).eq('id', user.id);
    }

    await supabase.from('admin_users').update({ last_login: new Date().toISOString() }).eq('id', user.id);

    const role = user.role as AdminRole;
    const token = signAdminSession({
      sub: user.id,
      username: user.username,
      role,
      display_name: user.display_name || user.username,
    });

    const res = NextResponse.json({
      user: { username: user.username, role, display_name: user.display_name },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
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

  if (!valid) return genericError;

  const token = signAdminSession({
    sub: 'admin',
    username: 'admin',
    role: 'owner',
    display_name: 'Jennifer',
  });

  const res = NextResponse.json({
    user: { username: 'admin', role: 'owner', display_name: 'Jennifer' },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

