// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { sendOrderShoppedEmail } from '@/lib/email';
import { Order } from '@/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

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

    // When order is marked fulfilled, send the Order Shopped email.
    // Must be fully awaited before returning — Vercel terminates the function
    // as soon as the response is sent, so fire-and-forget won't work here.
    if (body.status === 'fulfilled') {
      const { data: fullOrder } = await supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('id', id)
        .single();

      if (fullOrder) {
        try {
          const { data: s } = await supabase
            .from('admin_settings')
            .select('business_email, order_email_cc')
            .single();

          await sendOrderShoppedEmail(fullOrder as Order, {
            businessEmail: s?.business_email || process.env.BUSINESS_EMAIL,
            ccEmailRaw: s?.order_email_cc,
          });
        } catch (err) {
          console.error('Order Shopped email error:', err);
          // Don't fail the status update if email fails
        }
      }
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;
  const role = session.role;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from('orders')
    .select('order_number, status, company_name, contact_name, phone, po_number')
    .eq('id', id)
    .single();

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
