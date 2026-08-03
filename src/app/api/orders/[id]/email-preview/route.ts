// src/app/api/orders/[id]/email-preview/route.ts
// Renders the EXACT final "Order Shopped" email for this order as HTML —
// shown in-app (iframe) inside the dashboard's confirm dialog so a GTS owner
// can eyeball it before firing. This is the error-catcher: if Sinclair's
// shopped from a printed list and forgot to record a substitution in the
// panel, it shows here BEFORE the customer ever sees it.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { buildOrderShoppedEmailHtml } from '@/lib/email';
import { Order } from '@/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*), discounts:order_discounts(*)')
    .eq('id', id)
    .single();
  if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  // Live overrides from the send dialog — lets the owner preview the delivery
  // fee / bill-for-groceries choice BEFORE it's saved to the order.
  const { searchParams } = new URL(req.url);
  const merged = { ...order } as Order;
  if (searchParams.has('delivery_fee')) merged.delivery_fee = Number(searchParams.get('delivery_fee')) || 0;
  if (searchParams.has('delivery_service_type')) merged.delivery_service_type = searchParams.get('delivery_service_type');
  if (searchParams.has('bill_for_groceries')) merged.bill_for_groceries = searchParams.get('bill_for_groceries') === 'true';
  if (searchParams.has('register_total')) merged.register_total = Number(searchParams.get('register_total')) || null;

  const html = buildOrderShoppedEmailHtml(merged);
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
