// src/app/api/admin/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';

function hashPassword(p: string) {
  return createHash('sha256').update(p + 'gts-salt-2024').digest('hex');
}

export async function POST(req: NextRequest) {
  const { password, username } = await req.json();
  if (!password) return NextResponse.json({ error: 'Password required' }, { status: 400 });

  const supabase = createServiceClient();

  // If username provided, check admin_users table (multi-user)
  if (username) {
    const { data: user } = await supabase
      .from('admin_users')
      .select('id, username, role, display_name, password_hash, is_active')
      .eq('username', username.toLowerCase().trim())
      .eq('is_active', true)
      .single();

    if (user && hashPassword(password) === user.password_hash) {
      await supabase.from('admin_users').update({ last_login: new Date().toISOString() }).eq('id', user.id);
      return NextResponse.json({
        token: process.env.ADMIN_SECRET_KEY,
        user: { username: user.username, role: user.role, display_name: user.display_name },
      });
    }
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  // Legacy single-password login — check Supabase stored hash first, then env var
  const { data: settings } = await supabase
    .from('admin_settings')
    .select('admin_password_hash')
    .single();

  const storedHash = settings?.admin_password_hash;
  const envPassword = process.env.ADMIN_PASSWORD || 'grafton2024';

  const valid = (storedHash && hashPassword(password) === storedHash) ||
                (!storedHash && password === envPassword);

  if (!valid) return NextResponse.json({ error: 'Invalid password' }, { status: 401 });

  return NextResponse.json({
    token: process.env.ADMIN_SECRET_KEY,
    user: { username: 'admin', role: 'owner', display_name: 'Jennifer' },
  });
}
