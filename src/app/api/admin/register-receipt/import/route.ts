// src/app/api/admin/register-receipt/import/route.ts
// Save a reviewed Sinclair register receipt as a PAST boat order.
// No email. No push. Staff confirmed every line in the UI first.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { vesselNameKey } from '@/lib/vessel-membership';
import { logActivity } from '@/lib/activity-log';

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const companyName = String(body.company_name || '').trim();
  const vesselName = String(body.vessel_name || '').trim();
  const vesselId = body.vessel_id ? String(body.vessel_id) : null;
  const customerEmail = body.customer_email ? String(body.customer_email).trim() : null;
  const registerTotal = body.register_total != null ? Number(body.register_total) : null;
  const notesExtra = String(body.notes || '').trim();
  const lines = Array.isArray(body.lines) ? body.lines : [];

  if (!companyName || !vesselName) {
    return NextResponse.json({ error: 'company_name and vessel_name required' }, { status: 400 });
  }
  if (!lines.length) {
    return NextResponse.json({ error: 'No lines to import' }, { status: 400 });
  }

  const items = lines.map((l: {
    product_id?: string | null;
    description?: string;
    qty?: number;
    unit_price?: number;
  }) => {
    const description = String(l.description || '').trim();
    const quantity = Number(l.qty) || 0;
    const unit_price = Number(l.unit_price) || 0;
    if (!description || quantity <= 0) return null;
    return {
      product_id: l.product_id || null,
      description,
      quantity,
      unit_price,
      line_total: Math.round(unit_price * quantity * 100) / 100,
      paid_by: 'vessel',
      item_type: 'grocery',
    };
  }).filter(Boolean) as Array<{
    product_id: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    paid_by: string;
    item_type: string;
  }>;

  if (!items.length) {
    return NextResponse.json({ error: 'No valid lines' }, { status: 400 });
  }

  const subtotal = items.reduce((s, it) => s + it.line_total, 0);
  const notes = [
    'Imported from Sinclair register receipt (staff review).',
    notesExtra,
  ].filter(Boolean).join('\n');

  const supabase = createServiceClient();

  // Prefer an explicit vessel_id; otherwise resolve from company + boat so
  // membership RLS shows this import on the crew logins for that boat.
  let resolvedVesselId = vesselId;
  if (!resolvedVesselId) {
    const key = vesselNameKey(vesselName);
    if (key) {
      const { data: vesselRows } = await supabase
        .from('vessels')
        .select('id, name, company:companies!inner(name)')
        .eq('name_key', key);
      const coLower = companyName.toLowerCase();
      const hit = (vesselRows || []).find((row: {
        id: string;
        company?: { name?: string } | { name?: string }[] | null;
      }) => {
        const co = Array.isArray(row.company) ? row.company[0]?.name : row.company?.name;
        return (co || '').toLowerCase() === coLower;
      }) || (vesselRows || [])[0];
      if (hit?.id) resolvedVesselId = String(hit.id);
    }
  }

  // Historical import — fulfilled so it does not land in the new-order queue.
  // Do NOT call email/push helpers from this route.
  const orderNumber = `IMP-${Date.now().toString(36).toUpperCase()}`;
  const insertOrder: Record<string, unknown> = {
    order_number: orderNumber,
    company_name: companyName,
    contact_name: session.display_name || 'Staff import',
    phone: '',
    customer_email: customerEmail,
    vessel_name: vesselName,
    vessel_id: resolvedVesselId,
    status: 'fulfilled',
    subtotal,
    register_total: registerTotal ?? subtotal,
    discount_total: 0,
    notes,
    bill_for_groceries: true,
  };

  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert(insertOrder)
    .select('id, order_number')
    .single();

  if (oErr || !order) {
    return NextResponse.json({ error: oErr?.message || 'Failed to create order' }, { status: 500 });
  }

  const { error: iErr } = await supabase.from('order_items').insert(
    items.map(it => ({ ...it, order_id: order.id })),
  );
  if (iErr) {
    return NextResponse.json({ error: iErr.message }, { status: 500 });
  }

  await logActivity(supabase, {
    order_id: order.id,
    order_number: order.order_number,
    action: 'register_import',
    from_value: null,
    to_value: `${items.length} line${items.length === 1 ? '' : 's'}`,
    admin_username: session.username,
    admin_display_name: session.display_name,
    admin_role: session.role,
    company_name: companyName,
    contact_name: vesselName,
    phone: null,
    po_number: null,
    note: `Saved as past boat order · ${vesselName}`,
  });

  return NextResponse.json({
    order_id: order.id,
    order_number: order.order_number,
    line_count: items.length,
    subtotal,
  });
}
