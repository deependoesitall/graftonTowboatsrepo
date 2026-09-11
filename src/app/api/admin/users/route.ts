// src/app/api/admin/users/route.ts
// User management — OWNER ONLY.
// Managers previously had limited access here; per the confirmed Sinclair
// manager scope (orders, products, own password only) user management is now
// restricted to owners entirely. Managers change their own password via
// /api/admin/me/password.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/password';
import { requireAdmin } from '@/lib/admin-auth-server';

export const runtime = 'nodejs';

const SELECTABLE_FIELDS = 'id, username, role, display_name, is_active, last_login, created_at, permissions';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_users')
    .select(SELECTABLE_FIELDS)
    .order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { username, password, role, display_name, permissions } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('admin_users').insert({
    username: username.toLowerCase().trim(),
    password_hash: await hashPassword(password),
    role: role || 'staff',
    display_name: display_name || username,
    permissions: Array.isArray(permissions) ? permissions : [],
  }).select(SELECTABLE_FIELDS).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const { id, password, ...updates } = body as {
    id?: string;
    password?: string;
    [key: string]: unknown;
  };
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // ⚠️ NORMALIZE THE USERNAME ON WRITE, ALWAYS.
  //
  // The login route looks accounts up with `username.toLowerCase().trim()`. If
  // an edit here saves "Jen" while login searches for "jen", the row simply
  // stops matching — and because the login deliberately returns one generic
  // "Invalid username or password" for every lookup miss, the account looks
  // like it has the wrong password rather than the wrong case. POST already
  // lowercases; PATCH did not, so renaming an account through the Users page
  // could silently lock that person out.
  if (typeof updates.username === 'string') {
    updates.username = updates.username.toLowerCase().trim();
  }

  // Owner password reset path — hash here, never store plaintext.
  if (typeof password === 'string') {
    const trimmed = password.trim();
    if (trimmed.length < 4) {
      return NextResponse.json(
        { error: 'Password must be at least 4 characters.' },
        { status: 400 },
      );
    }
    updates.password_hash = await hashPassword(trimmed);
  }

  // Refuse empty PATCH bodies (nothing to update).
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_users')
    .update(updates)
    .eq('id', id)
    .select(SELECTABLE_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createServiceClient();
  await supabase.from('admin_users').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
