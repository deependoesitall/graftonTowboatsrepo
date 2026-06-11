// src/app/api/admin/me/route.ts
// Returns the current admin session's role/display info, or 401 if not
// logged in. Used by the client to gate UI without ever handling the
// session token directly.
//
// Each successful check re-issues the session cookie with a fresh
// 20-minute expiry (sliding session) — so an actively-open admin tab
// never expires, but a closed/idle tab's session lapses naturally.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, signAdminSession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const res = NextResponse.json({
    username: session.username,
    role: session.role,
    display_name: session.display_name,
  });

  // Slide the session forward.
  const refreshed = signAdminSession({
    sub: session.sub,
    username: session.username,
    role: session.role,
    display_name: session.display_name,
  });
  res.cookies.set(SESSION_COOKIE, refreshed, sessionCookieOptions());

  return res;
}
