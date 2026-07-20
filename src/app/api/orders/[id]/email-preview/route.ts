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

  const html = buildOrderShoppedEmailHtml(order as Order);
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
