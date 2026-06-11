// src/app/api/admin/logout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, clearedCookieOptions, getAdminSession, deleteAdminSession } from '@/lib/admin-auth-server';

export async function POST(req: NextRequest) {
  const session = getAdminSession(req);
  if (session) {
    await deleteAdminSession(session.jti);
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, '', clearedCookieOptions());
  return res;
}
