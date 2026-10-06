// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, isGtsRole, isSinclairScoped } from '@/lib/admin-auth-server';
import { hydrateOrderItemCatalog } from '@/lib/order-item-catalog';
import { normalizeGroceryHandlingFee } from '@/lib/grocery-handling-fee';
import { sendOrderPush } from '@/lib/push';
import { sendHandoffEmail } from '@/lib/email';
import type { Order, OrderHandoff } from '@/types';

const HANDOFFS: readonly OrderHandoff[] = ['delivered_to_gts', 'awaiting_gts_pickup'];

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
  if (body && typeof body === 'object' && 'grocery_handling_fee' in body) {
    body.grocery_handling_fee = normalizeGroceryHandlingFee(body.grocery_handling_fee);
  }

  // ── SINCLAIR'S PIPELINE ENDS AT 'SHOPPED' ──
  // 'fulfilled' means Grafton Towboat Services delivered to the vessel AND sent the customer
  // their final email — which carries GTS's delivery fee and billing terms.
  // Sinclair's neither sees that email nor controls the delivery, so they must
  // not be able to declare it happened. Enforced HERE rather than by hiding a
  // button: the client can be edited, this cannot.
  if (body.status === 'fulfilled' && !isGtsRole(session.role)) {
    return NextResponse.json(
      { error: "Only Grafton Towboat Services can mark an order fulfilled — that happens on delivery. Confirm the register total to mark it Shopped." },
      { status: 403 },
    );
  }

  // Crew change is GTS work. Sinclair-scoped sessions must never set it —
  // even if a client UI is patched to show the editor.
  const crewKeys = ['crew_change', 'crew_change_notes', 'crew_arriving', 'crew_departing'] as const;
  const touchingCrew = crewKeys.some((k) => k in body && body[k] !== undefined);
  if (touchingCrew && isSinclairScoped(session)) {
    return NextResponse.json(
      { error: 'Only Grafton Towboat Services staff can set crew change.' },
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

  // ── HANDOFF: WHERE THE BOXES ARE, NOT HOW FAR ALONG THE ORDER IS ──
  // Sinclair's tells GTS whether they ran the order down to the Grafton
  // coolers or left it boxed at the store. Validated here rather than trusted
  // from the client, same as every other field on this route.
  const handoffValue: OrderHandoff | null | undefined =
    'handoff' in body ? ((body.handoff as OrderHandoff | null) ?? null) : undefined;
  if (
    handoffValue !== undefined &&
    handoffValue !== null &&
    !HANDOFFS.includes(handoffValue)
  ) {
    return NextResponse.json(
      { error: 'handoff must be delivered_to_gts or awaiting_gts_pickup' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Fetch current order so we can log the status transition and trigger emails
  const { data: existing } = await supabase
    .from('orders')
    .select('status, order_number, company_name, contact_name, phone, po_number')
    .eq('id', id)
    .single();

  // A handoff only means anything after the register. Before 'shopped' there
  // is nothing boxed to hand over, so the buttons don't render — and this
  // stops a stale tab or a patched client from setting it anyway.
  const effectiveStatus = (body.status as string | undefined) || existing?.status;
  if (handoffValue && effectiveStatus !== 'shopped') {
    return NextResponse.json(
      { error: 'An order has to be Shopped before it can be handed off.' },
      { status: 409 },
    );
  }

  // Who and when, stamped server-side. Clearing the handoff clears both.
  let priorHandoff: OrderHandoff | null = null;
  if (handoffValue !== undefined) {
    const { data: prior } = await supabase
      .from('orders').select('handoff').eq('id', id).maybeSingle();
    priorHandoff = (prior as { handoff?: OrderHandoff | null } | null)?.handoff ?? null;
    body.handoff_at = handoffValue ? new Date().toISOString() : null;
    body.handoff_by = handoffValue
      ? (session.display_name || session.username)
      : null;
  }

  let updateBody: Record<string, unknown> = {
    ...body,
    updated_at: new Date().toISOString(),
  };
  let { data, error } = await supabase
    .from('orders')
    .update(updateBody)
    .eq('id', id)
    .select()
    .single();

  // A database that has not run 096 has no grocery_handling_fee column.
  // Dropping just that key keeps the register total (and everything else
  // in this patch) from failing with it.
  if (error && /grocery_handling_fee/i.test(error.message) && 'grocery_handling_fee' in updateBody) {
    delete updateBody.grocery_handling_fee;
    const retry = await supabase.from('orders').update(updateBody).eq('id', id).select().single();
    data = retry.data;
    error = retry.error;
  }

  // Unlike grocery_handling_fee above, a missing handoff column is NOT dropped
  // and retried. The handoff is the entire point of this patch, so silently
  // saving nothing and reporting success would tell Jen an order is waiting at
  // Sinclair's when the system never recorded it. Fail loudly, and say why.
  if (error && /handoff/i.test(error.message) && handoffValue !== undefined) {
    return NextResponse.json(
      { error: 'Handoff is not set up on this database yet — run migration 098_order_handoff.sql.' },
      { status: 500 },
    );
  }

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

  // ── TELL GTS ──
  // Only when the value actually changed: Sinclair's tapping the button they
  // already tapped must not put a second alert on Jen's phone.
  if (handoffValue !== undefined && handoffValue !== priorHandoff) {
    const order = data as Order;

    await supabase.from('activity_logs').insert({
      order_id: id,
      order_number: existing?.order_number ?? order.order_number,
      action: 'handoff',
      from_value: priorHandoff,
      to_value: handoffValue,
      admin_username: session.username,
      admin_display_name: session.display_name,
      admin_role: session.role,
      company_name: existing?.company_name,
      contact_name: existing?.contact_name,
      phone: existing?.phone,
      po_number: existing?.po_number,
    }).then(undefined, (e: unknown) => console.error('handoff log:', e));

    if (handoffValue) {
      const vessel  = order.vessel_name || order.company_name || 'vessel';
      const pickup  = handoffValue === 'awaiting_gts_pickup';

      // ⚠️ GTS ONLY. Sinclair's just pressed the button; telling them what
      // they already know is the fastest way to get notifications muted.
      //
      // Neither send may take the PATCH down with it. Sinclair's has done
      // their part the moment the row is written — a Resend outage must not
      // read back to them as "that didn't save".
      try {
        await sendOrderPush(order, { gts: true }, {
          title: pickup
            ? `Ready for pickup — ${vessel}`
            : `Delivered to Grafton — ${vessel}`,
          body: pickup
            ? `Boxed and ready at Sinclair's. Pickup Order #${order.order_number} at Sinclair's Foods`
            : `Order #${order.order_number} is in the GTS cooler, ready to load.`,
          // Lands on a compact handoff card; full order one tap away.
          url: `/admin/orders?order=${order.id}&focus=handoff`,
          // Distinct from `order-<number>` so it sits alongside the new-order
          // alert instead of quietly replacing it on the lock screen.
          tag: `handoff-${order.order_number}`,
        });
      } catch (e) {
        console.error('handoff push:', e);
      }

      try {
        const { data: s } = await supabase
          .from('admin_settings')
          .select('business_email, order_email_cc')
          .single();
        await sendHandoffEmail(order, handoffValue, {
          businessEmail: s?.business_email,
          ccEmailRaw: s?.order_email_cc,
          staffName: session.display_name || session.username,
        });
      } catch (e) {
        console.error('handoff email:', e);
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
        { error: 'Only Grafton Towboat Services staff can remove imported orders.' },
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
