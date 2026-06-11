// src/app/api/admin/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hashPassword, verifyPassword } from '@/lib/password';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'settings' });
  if (session instanceof NextResponse) return session;

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
  const session = requireAdmin(req, { area: 'settings', editRequired: true });
  if (session instanceof NextResponse) return session;

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
  if (body.email_header_tagline !== undefined) updates.email_header_tagline = body.email_header_tagline;
  if (body.email_intro_message !== undefined) updates.email_intro_message = body.email_intro_message;
  if (body.email_footer_text !== undefined) updates.email_footer_text = body.email_footer_text;
  if (body.email_button_text !== undefined) updates.email_button_text = body.email_button_text;
  if (body.email_button_url !== undefined) updates.email_button_url = body.email_button_url;

  // Password change — requires current password verification.
  // Only the owner may change the legacy single-password.
  if (body.new_password) {
    if (session.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!body.current_password) {
      return NextResponse.json({ error: 'Current password required' }, { status: 400 });
    }
    const { data: settings } = await supabase.from('admin_settings').select('admin_password_hash').single();
    const storedHash = settings?.admin_password_hash as string | null | undefined;

    let validCurrent = false;
    if (storedHash) {
      validCurrent = await verifyPassword(body.current_password, storedHash);
    } else {
      // No password has been set in Supabase yet — fall back to ADMIN_PASSWORD env var.
      // No hardcoded default; if ADMIN_PASSWORD is unset, this fails closed.
      const envPassword = process.env.ADMIN_PASSWORD;
      validCurrent = !!envPassword && body.current_password === envPassword;
    }

    if (!validCurrent) {
      return NextResponse.json({ error: 'Current password incorrect' }, { status: 400 });
    }
    updates.admin_password_hash = await hashPassword(body.new_password);
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
