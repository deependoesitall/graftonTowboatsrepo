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

  const { id, password, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  if (password) (updates as Record<string, unknown>).password_hash = await hashPassword(password);

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
