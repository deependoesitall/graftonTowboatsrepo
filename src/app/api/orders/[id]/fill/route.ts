// POST /api/orders/:id/fill
//
// One-shot "accept as ordered" for Sinclair's. The pick list is paper; they
// mark exceptions on it, ring the register, then come back here. Marking 90
// lines with 90 sequential PATCHes is what made Fill items hang and dump
// people back to the queue with the order merely In Progress.
//
// Pending grocery lines become shopped in one UPDATE. Out-of-stock stays
// out-of-stock. Service lines are untouched. Order moves to in_progress if
// it was still new.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { recalcSubtotal } from '@/lib/recalc-subtotal';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = requireAdmin(req, { area: 'orders', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { id: orderId } = await params;
  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .single();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const { data: filled, error } = await supabase
    .from('order_items')
    .update({ shopping_status: 'shopped' })
    .eq('order_id', orderId)
    .eq('item_type', 'grocery')
    .eq('shopping_status', 'pending')
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (order.status === 'new') {
    await supabase
      .from('orders')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', orderId);
  }

  await recalcSubtotal(supabase, orderId);

  return NextResponse.json({
    filled: (filled || []).length,
    status: order.status === 'new' ? 'in_progress' : order.status,
  });
}
