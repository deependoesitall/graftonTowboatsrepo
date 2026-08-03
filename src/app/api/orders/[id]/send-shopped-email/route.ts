// src/app/api/orders/[id]/send-shopped-email/route.ts
// THE final customer email — fired manually, one click from the GTS dashboard.
// Owner-only: Sinclair's finishing the shopping isn't the end of the job
// (CODs, crew changes, pickups), so Grafton decides when the order is truly
// done and the customer hears about it.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { sendOrderShoppedEmail } from '@/lib/email';
import { Order } from '@/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const supabase = createServiceClient();

  // Delivery billing from the send dialog — persist it FIRST so the email
  // (and the stored order) reflect the final fee + bill-for-groceries choice.
  const body = await req.json().catch(() => ({}));
  const deliveryUpdate: Record<string, unknown> = {};
  if ('delivery_fee' in body) deliveryUpdate.delivery_fee = body.delivery_fee === '' || body.delivery_fee == null ? null : Number(body.delivery_fee);
  if ('delivery_service_type' in body) deliveryUpdate.delivery_service_type = body.delivery_service_type || null;
  if ('delivery_company_id' in body) deliveryUpdate.delivery_company_id = body.delivery_company_id || null;
  if ('bill_for_groceries' in body) deliveryUpdate.bill_for_groceries = !!body.bill_for_groceries;
  // Grocery total from Sinclair's receipt (only sent for grocery-billed orders).
  if (body.register_total != null && body.register_total !== '') deliveryUpdate.register_total = Number(body.register_total);
  if (Object.keys(deliveryUpdate).length) {
    await supabase.from('orders').update(deliveryUpdate).eq('id', id);
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*), discounts:order_discounts(*)')
    .eq('id', id)
    .single();
  if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  try {
    const { data: s } = await supabase
      .from('admin_settings')
      .select('business_email, order_email_cc')
      .single();

    await sendOrderShoppedEmail(order as Order, {
      businessEmail: s?.business_email || process.env.BUSINESS_EMAIL,
      ccEmailRaw: s?.order_email_cc,
    });
  } catch (err) {
    console.error('Manual shopped email error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Email failed to send' },
      { status: 500 },
    );
  }

  const sentAt = new Date().toISOString();
  await supabase.from('orders')
    .update({ shopped_email_sent_at: sentAt, shopped_email_sent_by: session.display_name || session.username })
    .eq('id', id);

  await supabase.from('activity_logs').insert({
    order_id: id,
    order_number: order.order_number,
    action: 'final_email_sent',
    from_value: null,
    to_value: order.vessel_email || order.customer_email || 'no email on order',
    admin_username: session.username,
    admin_display_name: session.display_name,
    admin_role: session.role,
    company_name: order.company_name,
    contact_name: order.contact_name,
    phone: order.phone,
    po_number: order.po_number,
  });

  return NextResponse.json({ ok: true, sent_at: sentAt, sent_to: order.vessel_email || order.customer_email });
}
