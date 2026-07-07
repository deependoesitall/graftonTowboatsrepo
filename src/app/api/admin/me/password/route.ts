// src/app/api/admin/me/password/route.ts
// Own-password change for any logged-in admin user (owner, manager, staff).
// Managers/staff can ONLY change their own password — nothing else.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hashPassword, verifyPassword } from '@/lib/password';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function POST(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const { current_password, new_password } = await req.json();
  if (!current_password) return NextResponse.json({ error: 'Current password required' }, { status: 400 });
  if (!new_password || new_password.length < 4) {
    return NextResponse.json({ error: 'New password must be at least 4 characters' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Legacy single-password owner login (sub === 'admin') — stored in admin_settings.
  if (session.sub === 'admin') {
    const { data: settings } = await supabase.from('admin_settings').select('id, admin_password_hash').single();
    const storedHash = settings?.admin_password_hash as string | null | undefined;
    let valid = false;
    if (storedHash) valid = await verifyPassword(current_password, storedHash);
    else {
      const envPassword = process.env.ADMIN_PASSWORD;
      valid = !!envPassword && current_password === envPassword;
    }
    if (!valid) return NextResponse.json({ error: 'Current password incorrect' }, { status: 400 });

    const { error } = await supabase
      .from('admin_settings')
      .update({ admin_password_hash: await hashPassword(new_password) })
      .eq('id', settings!.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Named admin_users account — verify against the user's own hash.
  const { data: user, error: fetchErr } = await supabase
    .from('admin_users')
    .select('id, password_hash')
    .eq('id', session.sub)
    .single();
  if (fetchErr || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const valid = await verifyPassword(current_password, user.password_hash);
  if (!valid) return NextResponse.json({ error: 'Current password incorrect' }, { status: 400 });

  const { error } = await supabase
    .from('admin_users')
    .update({ password_hash: await hashPassword(new_password) })
    .eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
