// src/app/api/admin/me/route.ts
// Returns the current admin session's role/display info, or 401 if not
// logged in. Used by the client to gate UI without ever handling the
// session token directly.
//
// In addition to verifying the JWT, this checks that the session's jti
// is still present in admin_sessions — that row is deleted on logout
// and on browser-close (via a beacon from AdminNav), so closing the
// admin panel and reopening it always requires logging in again.

import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, isSessionActive, SESSION_COOKIE, clearedCookieOptions } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const active = await isSessionActive(session.jti);
  if (!active) {
    const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    res.cookies.set(SESSION_COOKIE, '', clearedCookieOptions());
    return res;
  }

  return NextResponse.json({
    username: session.username,
    role: session.role,
    display_name: session.display_name,
  });
}
