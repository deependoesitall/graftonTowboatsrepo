// GET ?order_id=… → { register_total, grocery_handling_fee, grocery_billed, subtotal, status }
// Used by the delivery editor to autofill Sinclair's grocery total.
// grocery_billed is the register ring plus the optional handling fee.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { groceryBilledTotal } from '@/lib/grocery-handling-fee';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports' });
  if (session instanceof NextResponse) return session;
  const orderId = new URL(req.url).searchParams.get('order_id');
  if (!orderId) return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });

  const supabase = createServiceClient();
  const full = await supabase
    .from('orders')
    .select('id, register_total, grocery_handling_fee, subtotal, status, bill_for_groceries')
    .eq('id', orderId)
    .maybeSingle();
  let data: {
    id: string;
    register_total: number | null;
    grocery_handling_fee?: number | null;
    subtotal: number | null;
    status: string;
    bill_for_groceries: boolean | null;
  } | null = full.data;
  let error = full.error;
  if (error && /grocery_handling_fee/i.test(error.message)) {
    const retry = await supabase
      .from('orders')
      .select('id, register_total, subtotal, status, bill_for_groceries')
      .eq('id', orderId)
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  const billed = data.register_total != null ? groceryBilledTotal(data) : null;
  return NextResponse.json({ order: { ...data, grocery_billed: billed } });
}
