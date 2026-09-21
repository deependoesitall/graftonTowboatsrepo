// src/app/api/orders/[id]/send-shopped-email/route.ts
// THE final customer email — fired manually, one click from the GTS dashboard.
// Owner-only: Sinclair's finishing the shopping isn't the end of the job
// (CODs, crew changes, pickups), so Grafton decides when the order is truly
// done and the customer hears about it.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { sendOrderShoppedEmail } from '@/lib/email';
import { normalizeGroceryHandlingFee } from '@/lib/grocery-handling-fee';
import { Order } from '@/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = requireAdmin(req, { gtsOnly: true });
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
  // Sinclair's optional handling fee. Blank clears it. Not the GTS delivery fee.
  if ('grocery_handling_fee' in body) {
    deliveryUpdate.grocery_handling_fee = normalizeGroceryHandlingFee(body.grocery_handling_fee);
  }

  // ── GTS'S SERVICES ON THIS ORDER ────────────────────────────────
  //
  // One boat's trip can take more than one — a grocery delivery and a crew
  // change are two charges at two prices, which is how GTS's ledger has always
  // recorded them. Migration 091 derives delivery_fee (the sum) and
  // delivery_service_type from this, so the ledger, the QuickBooks pack and
  // every report keep reading the columns they always read.
  //
  // Normalised HERE and not trusted from the client: this is money, and the
  // dialog is not the only thing that could ever POST to this route.
  let charges: Array<{ service_type: string; amount: number; note?: string }> | null = null;
  if (Array.isArray(body.service_charges)) {
    charges = (body.service_charges as Array<Record<string, unknown>>)
      .map(c => ({
        service_type: String(c?.service_type ?? '').trim().slice(0, 120) || 'Delivery',
        amount: Math.round((Number(c?.amount) || 0) * 100) / 100,
        note: String(c?.note ?? '').trim().slice(0, 120) || undefined,
      }))
      // A row with no label and no money is a half-filled line somebody
      // abandoned in the dialog, not a service to invoice.
      .filter(c => c.service_type !== 'Delivery' || c.amount > 0);
    deliveryUpdate.service_charges = charges;
  }

  if (Object.keys(deliveryUpdate).length) {
    let patch: Record<string, unknown> = { ...deliveryUpdate };
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error: updErr } = await supabase.from('orders').update(patch).eq('id', id);
      if (!updErr) break;
      const before = Object.keys(patch).length;
      // A missing column fails the WHOLE update. Drop the column the database
      // doesn't have and retry so the delivery fee still saves.
      if (/grocery_handling_fee/i.test(updErr.message)) delete patch.grocery_handling_fee;
      else if (/service_charges/i.test(updErr.message)) delete patch.service_charges;
      else if ('service_charges' in patch) delete patch.service_charges;
      console.warn('[send-shopped-email] order update retry:', updErr.message);
      if (Object.keys(patch).length === 0 || Object.keys(patch).length === before) break;
    }
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*), discounts:order_discounts(*)')
    .eq('id', id)
    .single();
  if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  // GROCERY BILLING NEEDS SINCLAIR'S ACTUAL NUMBERS — enforced here, not just
  // in the dialog.
  //
  // Billing a boat for groceries off our ESTIMATE rather than Sinclair's
  // register total is how a customer gets an invoice that doesn't match the
  // receipt stapled to it. The dialog has always blocked this; the server never
  // did, which was fine while only owners could reach this route. GTS Managers
  // can now run the billing chain (Mary does the invoicing), so the rule has to
  // live where it can't be skipped.
  //
  // The owner override stays — deliberately, and deliberately owner-only.
  if (order.bill_for_groceries) {
    const missing: string[] = [];
    if (order.register_total == null) missing.push('Sinclair’s grocery total');
    if (!order.sinclairs_receipt_url) missing.push('Sinclair’s receipt');
    if (missing.length && session.role !== 'owner') {
      return NextResponse.json({
        error: `Add ${missing.join(' and ')} before sending a grocery bill, or turn off “Bill groceries.” An owner can override this.`,
      }, { status: 400 });
    }
  }

  try {
    const { data: s } = await supabase
      .from('admin_settings')
      .select('business_email, order_email_cc')
      .single();

    await sendOrderShoppedEmail(order as Order, {
      businessEmail: s?.business_email || process.env.BUSINESS_EMAIL,
      ccEmailRaw: s?.order_email_cc,
      staffNote: typeof body.staff_note === 'string' ? body.staff_note : '',
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
    note: (typeof body.staff_note === 'string' && body.staff_note.trim())
      ? body.staff_note.trim().slice(0, 500)
      : (Number(order.delivery_fee) === 0 ? 'Sent with $0 delivery fee' : null),
  });

  return NextResponse.json({ ok: true, sent_at: sentAt, sent_to: order.vessel_email || order.customer_email });
}
