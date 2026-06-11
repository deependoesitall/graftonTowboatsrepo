// src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/password';
import { requireAdmin } from '@/lib/admin-auth-server';

// User management is owner-only.

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, username, role, display_name, is_active, last_login, created_at')
    .order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { username, password, role, display_name } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('admin_users').insert({
    username, password_hash: await hashPassword(password),
    role: role || 'staff', display_name: display_name || username,
  }).select('id, username, role, display_name, is_active').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { id, password, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  if (password) (updates as any).password_hash = await hashPassword(password);
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('admin_users').update(updates).eq('id', id)
    .select('id, username, role, display_name, is_active').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { id } = await req.json();
  const supabase = createServiceClient();
  await supabase.from('admin_users').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
