// src/app/api/admin/users/route.ts
// User management — available to owners and managers.
// Owners can do everything. Managers can create/edit staff-level users only
// (they cannot create or edit owners or other managers).

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/password';
import { requireAdmin } from '@/lib/admin-auth-server';

const SELECTABLE_FIELDS = 'id, username, role, display_name, is_active, last_login, created_at, permissions';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'settings' });
  if (session instanceof NextResponse) return session;
  if (session.role !== 'owner' && session.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_users')
    .select(SELECTABLE_FIELDS)
    .order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'settings' });
  if (session instanceof NextResponse) return session;
  if (session.role !== 'owner' && session.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { username, password, role, display_name, permissions } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }

  // Managers can only create staff-level users
  const targetRole = role || 'staff';
  if (session.role === 'manager' && targetRole !== 'staff') {
    return NextResponse.json({ error: 'Managers can only create staff accounts' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('admin_users').insert({
    username: username.toLowerCase().trim(),
    password_hash: await hashPassword(password),
    role: targetRole,
    display_name: display_name || username,
    permissions: Array.isArray(permissions) ? permissions : [],
  }).select(SELECTABLE_FIELDS).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { area: 'settings' });
  if (session instanceof NextResponse) return session;
  if (session.role !== 'owner' && session.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id, password, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Managers can only edit staff-level users
  if (session.role === 'manager') {
    const supabase = createServiceClient();
    const { data: target } = await supabase
      .from('admin_users')
      .select('role')
      .eq('id', id)
      .single();
    if (!target || target.role !== 'staff') {
      return NextResponse.json({ error: 'Managers can only edit staff accounts' }, { status: 403 });
    }
    if (updates.role && updates.role !== 'staff') {
      return NextResponse.json({ error: 'Managers cannot change role above staff' }, { status: 403 });
    }
  }

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
  const session = requireAdmin(req, { area: 'settings' });
  if (session instanceof NextResponse) return session;
  if (session.role !== 'owner' && session.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Managers can only delete staff-level users
  if (session.role === 'manager') {
    const supabase = createServiceClient();
    const { data: target } = await supabase
      .from('admin_users')
      .select('role')
      .eq('id', id)
      .single();
    if (!target || target.role !== 'staff') {
      return NextResponse.json({ error: 'Managers can only delete staff accounts' }, { status: 403 });
    }
  }

  const supabase = createServiceClient();
  await supabase.from('admin_users').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
