// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, isGtsRole, isSinclairScoped } from '@/lib/admin-auth-server';
import { hydrateOrderItemCatalog } from '@/lib/order-item-catalog';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*), discounts:order_discounts(*)')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Backfill missing item locations AND images from the CURRENT catalog
  // (display only — not persisted). Register-tape imports often snapshot UPC
  // without a photo; the editor and shopping mode both read this.
  await hydrateOrderItemCatalog(supabase, data.items || []);

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = requireAdmin(req, { area: 'orders', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const body = await req.json();

  // ── SINCLAIR'S PIPELINE ENDS AT 'SHOPPED' ──
  // 'fulfilled' means Grafton delivered to the vessel AND sent the customer
  // their final email — which carries GTS's delivery fee and billing terms.
  // Sinclair's neither sees that email nor controls the delivery, so they must
  // not be able to declare it happened. Enforced HERE rather than by hiding a
  // button: the client can be edited, this cannot.
  if (body.status === 'fulfilled' && !isGtsRole(session.role)) {
    return NextResponse.json(
      { error: "Only Grafton Towboat can mark an order fulfilled — that happens on delivery. Confirm the register total to mark it Shopped." },
      { status: 403 },
    );
  }

  // Crew change is GTS work. Sinclair-scoped sessions must never set it —
  // even if a client UI is patched to show the editor.
  const crewKeys = ['crew_change', 'crew_change_notes', 'crew_arriving', 'crew_departing'] as const;
  const touchingCrew = crewKeys.some((k) => k in body && body[k] !== undefined);
  if (touchingCrew && isSinclairScoped(session)) {
    return NextResponse.json(
      { error: 'Only Grafton Towboat staff can set crew change.' },
      { status: 403 },
    );
  }
  if ('crew_change' in body && body.crew_change != null) {
    const cc = body.crew_change;
    if (cc !== 'yes' && cc !== 'maybe' && cc !== 'no') {
      return NextResponse.json({ error: 'crew_change must be yes, maybe, or no' }, { status: 400 });
    }
    if (cc !== 'yes') {
      // Clear counts when not a firm yes (mirrors place-order).
      body.crew_arriving = null;
      body.crew_departing = null;
    }
    if (cc === 'no') {
      body.crew_change_notes = null;
    }
  }

  const supabase = createServiceClient();

  // Fetch current order so we can log the status transition and trigger emails
  const { data: existing } = await supabase
    .from('orders')
    .select('status, order_number, company_name, contact_name, phone, po_number')
    .eq('id', id)
    .single();

  const { data, error } = await supabase
    .from('orders')
    .update({
      ...body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Write activity log for status changes
  if (body.status && existing && body.status !== existing.status) {
    await supabase.from('activity_logs').insert({
      order_id: id,
      order_number: existing.order_number,
      action: 'status_change',
      from_value: existing.status,
      to_value: body.status,
      admin_username: session.username,
      admin_display_name: session.display_name,
      admin_role: session.role,
      company_name: existing.company_name,
      contact_name: existing.contact_name,
      phone: existing.phone,
      po_number: existing.po_number,
    });

    // When order is marked fulfilled, recalculate the subtotal from final
    // shopping state (exclude out_of_stock items, use actual_total for weight
    // items). The final "Order Shopped" email is NOT sent here — fulfillment
    // by Sinclair's often isn't the end of the job (CODs, crew changes,
    // pickups). A GTS owner fires the final email manually from the dashboard
    // (POST /api/orders/[id]/send-shopped-email) after everything checks out.
    // Recalculate at SHOPPED as well as fulfilled. Shopping is when
    // out-of-stock lines and actual weights become known, so that is when
    // the subtotal stops being an estimate. Running it again on delivery is
    // harmless — the sum is idempotent.
    if (body.status === 'shopped' || body.status === 'fulfilled') {
      const { data: finalItems } = await supabase
        .from('order_items')
        .select('shopping_status, line_total, actual_total')
        .eq('order_id', id);

      if (finalItems) {
        const newSubtotal = finalItems
          .filter((i: { shopping_status: string }) => i.shopping_status !== 'out_of_stock')
          .reduce((sum: number, i: { line_total: number; actual_total: number | null }) =>
            sum + (i.actual_total ?? i.line_total), 0);

        await supabase
          .from('orders')
          .update({ subtotal: newSubtotal })
          .eq('id', id);
      }
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;
  const role = session.role;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from('orders')
    .select('order_number, status, company_name, contact_name, phone, po_number')
    .eq('id', id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // IMP-* is the register-tape / staff-import prefix — no email, no customer
  // facing. GTS staff need to wipe test imports after a training pass.
  // Real GTS-* orders stay owner-only so a shopper cannot erase a live ticket.
  const isImport = String(existing.order_number || '').startsWith('IMP-');
  if (isImport) {
    if (!isGtsRole(role)) {
      return NextResponse.json(
        { error: 'Only Grafton Towboat staff can remove imported orders.' },
        { status: 403 },
      );
    }
  } else if (role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing) {
    await supabase.from('activity_logs').insert({
      order_id: null,
      order_number: existing.order_number,
      action: 'order_deleted',
      from_value: existing.status,
      to_value: null,
      admin_username: session.username,
      admin_display_name: session.display_name,
      admin_role: role,
      company_name: existing.company_name,
      contact_name: existing.contact_name,
      phone: existing.phone,
      po_number: existing.po_number,
    });
  }

  return NextResponse.json({ success: true });
}
