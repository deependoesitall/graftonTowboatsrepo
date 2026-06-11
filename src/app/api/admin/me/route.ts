// src/app/api/admin/me/route.ts
// Returns the current admin session's role/display info, or 401 if not
// logged in. Used by the client to gate UI without ever handling the
// session token directly.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  return NextResponse.json({
    username: session.username,
    role: session.role,
    display_name: session.display_name,
  });
}
