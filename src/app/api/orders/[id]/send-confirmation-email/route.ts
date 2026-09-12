// POST /api/orders/:id/send-confirmation-email
// Send (or re-send) the boat confirmation after a staff-built order skipped it.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { sendOrderReceivedEmail } from '@/lib/email';
import { Order } from '@/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = requireAdmin(req, { area: 'orders', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*), discounts:order_discounts(*)')
    .eq('id', id)
    .single();
  if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const to = order.vessel_email || order.customer_email;
  if (!to) {
    return NextResponse.json({ error: 'No email on this order — add a vessel email first.' }, { status: 400 });
  }

  try {
    const { data: s } = await supabase
      .from('admin_settings')
      .select('business_email, order_email_cc, order_email_subject, email_header_tagline, email_intro_message, email_footer_text, email_button_text, email_button_url')
      .single();
    await sendOrderReceivedEmail(order as Order, {
      businessEmail: s?.business_email || process.env.BUSINESS_EMAIL,
      ccEmailRaw: s?.order_email_cc,
      template: {
        subject_template: s?.order_email_subject,
        header_tagline: s?.email_header_tagline,
        intro_message: s?.email_intro_message,
        footer_text: s?.email_footer_text,
        button_text: s?.email_button_text,
        button_url: s?.email_button_url,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Email failed to send' },
      { status: 500 },
    );
  }

  const sentAt = new Date().toISOString();
  const who = session.display_name || session.username;
  await supabase.from('orders').update({
    confirmation_email_sent_at: sentAt,
    confirmation_email_sent_by: who,
  }).eq('id', id);

  await supabase.from('activity_logs').insert({
    order_id: id,
    order_number: order.order_number,
    action: 'confirmation_email_sent',
    from_value: null,
    to_value: to,
    admin_username: session.username,
    admin_display_name: session.display_name,
    admin_role: session.role,
    company_name: order.company_name,
    contact_name: order.contact_name,
    phone: order.phone,
    po_number: order.po_number,
  });

  return NextResponse.json({ ok: true, sent_at: sentAt, sent_to: to, sent_by: who });
}
