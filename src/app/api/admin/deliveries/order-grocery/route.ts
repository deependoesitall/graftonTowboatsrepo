// GET ?order_id=… → { register_total, subtotal, status }
// Used by the delivery editor to autofill Sinclair's grocery total.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports' });
  if (session instanceof NextResponse) return session;
  const orderId = new URL(req.url).searchParams.get('order_id');
  if (!orderId) return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('orders')
    .select('id, register_total, subtotal, status, bill_for_groceries')
    .eq('id', orderId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  return NextResponse.json({ order: data });
}
