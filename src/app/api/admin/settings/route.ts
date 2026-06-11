// src/app/api/admin/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';

function hashPassword(password: string): string {
  return createHash('sha256').update(password + 'gts-salt-2024').digest('hex');
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-admin-token');
  if (authHeader !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_settings')
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Never send password hash to client
  const { admin_password_hash, ...safe } = data;
  return NextResponse.json(safe);
}

export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get('x-admin-token');
  if (authHeader !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, any> = {};
  if (body.business_email !== undefined) updates.business_email = body.business_email;
  if (body.order_email_cc !== undefined) updates.order_email_cc = body.order_email_cc;
  if (body.tax_rate !== undefined) updates.tax_rate = body.tax_rate;
  if (body.tax_enabled !== undefined) updates.tax_enabled = body.tax_enabled;
  if (body.draft_orders_enabled !== undefined) updates.draft_orders_enabled = body.draft_orders_enabled;
  if (body.repeat_orders_enabled !== undefined) updates.repeat_orders_enabled = body.repeat_orders_enabled;
  if (body.email_debug_enabled !== undefined) updates.email_debug_enabled = body.email_debug_enabled;
  if (body.order_email_subject !== undefined) updates.order_email_subject = body.order_email_subject;

  // Password change — requires current password verification
  if (body.new_password) {
    if (!body.current_password) {
      return NextResponse.json({ error: 'Current password required' }, { status: 400 });
    }
    // Check current password against env var OR stored hash
    const envPassword = process.env.ADMIN_PASSWORD || '';
    const { data: settings } = await supabase.from('admin_settings').select('admin_password_hash').single();
    const storedHash = settings?.admin_password_hash;
    const validCurrent = body.current_password === envPassword ||
      (storedHash && verifyPassword(body.current_password, storedHash));
    if (!validCurrent) {
      return NextResponse.json({ error: 'Current password incorrect' }, { status: 400 });
    }
    updates.admin_password_hash = hashPassword(body.new_password);
  }

  // Fetch the settings row id first so update targets a specific row
  const { data: existingRow, error: fetchErr } = await supabase
    .from('admin_settings')
    .select('id')
    .single();

  if (fetchErr || !existingRow) {
    return NextResponse.json({ error: fetchErr?.message || 'Settings row not found' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('admin_settings')
    .update(updates)
    .eq('id', existingRow.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { admin_password_hash, ...safe } = data;
  return NextResponse.json(safe);
}
