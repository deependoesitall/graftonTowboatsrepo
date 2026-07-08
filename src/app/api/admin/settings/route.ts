// src/app/api/admin/settings/route.ts
//
// Role scoping:
//   Owner   — full settings access.
//   Manager — sees/edits ONLY the Sinclair-owned fields: weekly_ad_url and
//             the order cutoff buffers. Everything else (business email, tax,
//             feature toggles, email config) is owner-only, enforced here —
//             not just hidden in the UI.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hashPassword, verifyPassword } from '@/lib/password';
import { requireAdmin } from '@/lib/admin-auth-server';

// Fields a manager may read and write.
const MANAGER_FIELDS = ['weekly_ad_url', 'grocery_cutoff_hours', 'service_cutoff_hours', 'show_digital_coupons'] as const;

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

  // Managers only receive the Sinclair-owned fields
  if (session.role !== 'owner') {
    const scoped: Record<string, unknown> = {};
    for (const f of MANAGER_FIELDS) scoped[f] = safe[f];
    return NextResponse.json(scoped);
  }

  return NextResponse.json(safe);
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { area: 'settings' });
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const supabase = createServiceClient();
  const isOwner = session.role === 'owner';

  const updates: Record<string, any> = {};

  // Manager-editable fields (Sinclair owns these)
  if (body.weekly_ad_url !== undefined) updates.weekly_ad_url = body.weekly_ad_url;
  if (body.grocery_cutoff_hours !== undefined) updates.grocery_cutoff_hours = Math.max(0, Number(body.grocery_cutoff_hours) || 0);
  if (body.service_cutoff_hours !== undefined) updates.service_cutoff_hours = Math.max(0, Number(body.service_cutoff_hours) || 0);
  if (body.show_digital_coupons !== undefined) updates.show_digital_coupons = !!body.show_digital_coupons;

  // Owner-only fields
  const ownerOnlyRequested = [
    'business_email', 'order_email_cc', 'tax_rate', 'tax_enabled',
    'draft_orders_enabled', 'repeat_orders_enabled', 'email_debug_enabled',
    'fleet_cta_enabled',
    'order_email_subject', 'email_header_tagline', 'email_intro_message',
    'email_footer_text', 'email_button_text', 'email_button_url', 'new_password',
  ].some(f => body[f] !== undefined);

  if (ownerOnlyRequested && !isOwner) {
    return NextResponse.json({ error: 'Forbidden — owner-only settings' }, { status: 403 });
  }

  if (isOwner) {
    if (body.business_email !== undefined) updates.business_email = body.business_email;
    if (body.order_email_cc !== undefined) updates.order_email_cc = body.order_email_cc;
    if (body.tax_rate !== undefined) updates.tax_rate = body.tax_rate;
    if (body.tax_enabled !== undefined) updates.tax_enabled = body.tax_enabled;
    if (body.draft_orders_enabled !== undefined) updates.draft_orders_enabled = body.draft_orders_enabled;
    if (body.repeat_orders_enabled !== undefined) updates.repeat_orders_enabled = body.repeat_orders_enabled;
    if (body.email_debug_enabled !== undefined) updates.email_debug_enabled = body.email_debug_enabled;
    if (body.fleet_cta_enabled !== undefined) updates.fleet_cta_enabled = !!body.fleet_cta_enabled;
    if (body.order_email_subject !== undefined) updates.order_email_subject = body.order_email_subject;
    if (body.email_header_tagline !== undefined) updates.email_header_tagline = body.email_header_tagline;
    if (body.email_intro_message !== undefined) updates.email_intro_message = body.email_intro_message;
    if (body.email_footer_text !== undefined) updates.email_footer_text = body.email_footer_text;
    if (body.email_button_text !== undefined) updates.email_button_text = body.email_button_text;
    if (body.email_button_url !== undefined) updates.email_button_url = body.email_button_url;

    // Legacy single-password change — owner only, requires current password.
    if (body.new_password) {
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
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
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

  if (session.role !== 'owner') {
    const scoped: Record<string, unknown> = {};
    for (const f of MANAGER_FIELDS) scoped[f] = safe[f];
    return NextResponse.json(scoped);
  }
  return NextResponse.json(safe);
}
