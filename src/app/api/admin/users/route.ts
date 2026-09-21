// src/app/api/admin/users/route.ts
// User management.
//   Owner            — full CRUD on every admin account.
//   Sinclair Manager — list / create / password-reset / activate ONLY Sinclair
//                      staff accounts (manager or staff with sinclair perm).
//                      Cannot touch Owner, gts_manager, or plain GTS staff.
//   Others           — forbidden (change own password via /api/admin/me/password).

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/password';
import {
  requireAdmin,
  canManageAdminUsers,
  isSinclairStaffAccount,
  type AdminSessionPayload,
} from '@/lib/admin-auth-server';

export const runtime = 'nodejs';

const SELECTABLE_FIELDS = 'id, username, role, display_name, is_active, last_login, created_at, permissions';

function forbid(): NextResponse {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

function assertCanManage(session: AdminSessionPayload): NextResponse | null {
  if (!canManageAdminUsers(session)) return forbid();
  return null;
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;
  const denied = assertCanManage(session);
  if (denied) return denied;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_users')
    .select(SELECTABLE_FIELDS)
    .order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  if (session.role === 'owner') return NextResponse.json(rows);
  // Sinclair manager: Sinclair staff only.
  return NextResponse.json(rows.filter(isSinclairStaffAccount));
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;
  const denied = assertCanManage(session);
  if (denied) return denied;

  const body = await req.json();
  const { username, password, display_name } = body as {
    username?: string;
    password?: string;
    role?: string;
    display_name?: string;
    permissions?: unknown;
  };
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }
  if (String(password).trim().length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters.' }, { status: 400 });
  }

  let role = typeof body.role === 'string' ? body.role : 'staff';
  let permissions: string[] = Array.isArray(body.permissions)
    ? (body.permissions as string[]).filter((p) => p === 'sinclair')
    : [];

  if (session.role === 'manager') {
    // Sinclair manager may only mint Sinclair staff / Sinclair managers.
    if (role !== 'manager' && role !== 'staff') {
      return NextResponse.json(
        { error: "Sinclair managers can only add Sinclair's Manager or Staff accounts." },
        { status: 403 },
      );
    }
    if (!permissions.includes('sinclair')) permissions = [...permissions, 'sinclair'];
  } else {
    // Owner: allow any role; if they pick Sinclair manager, keep sinclair flag convention.
    if (role === 'manager' && !permissions.includes('sinclair')) {
      permissions = [...permissions, 'sinclair'];
    }
    if (role !== 'owner' && role !== 'gts_manager' && role !== 'manager' && role !== 'staff') {
      role = 'staff';
    }
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('admin_users').insert({
    username: username.toLowerCase().trim(),
    password_hash: await hashPassword(String(password).trim()),
    role,
    display_name: display_name || username,
    permissions,
  }).select(SELECTABLE_FIELDS).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;
  const denied = assertCanManage(session);
  if (denied) return denied;

  const body = await req.json();
  const { id, password, ...rest } = body as {
    id?: string;
    password?: string;
    [key: string]: unknown;
  };
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: target, error: loadErr } = await supabase
    .from('admin_users')
    .select('id, username, role, permissions, is_active')
    .eq('id', id)
    .single();
  if (loadErr || !target) {
    return NextResponse.json({ error: loadErr?.message || 'User not found' }, { status: 404 });
  }

  if (session.role === 'manager') {
    if (!isSinclairStaffAccount(target)) {
      return NextResponse.json(
        { error: "You can only manage Sinclair's staff accounts." },
        { status: 403 },
      );
    }
    // Narrow the writable surface for Sinclair managers.
    const updates: Record<string, unknown> = {};
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
    if (typeof rest.display_name === 'string') {
      updates.display_name = rest.display_name;
    }
    if (typeof rest.is_active === 'boolean') {
      updates.is_active = rest.is_active;
    }
    // Role / permissions / username changes for peers stay Owner-only.
    if (rest.role !== undefined || rest.permissions !== undefined || rest.username !== undefined) {
      return NextResponse.json(
        { error: 'Only an Owner can change roles or permissions.' },
        { status: 403 },
      );
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('admin_users')
      .update(updates)
      .eq('id', id)
      .select(SELECTABLE_FIELDS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Owner path.
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (k === 'id' || k === 'password' || k === 'password_hash') continue;
    updates[k] = v;
  }
  if (typeof updates.username === 'string') {
    updates.username = (updates.username as string).toLowerCase().trim();
  }
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
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

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
  // Deletes stay Owner-only — Sinclair managers deactivate instead.
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createServiceClient();
  await supabase.from('admin_users').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
