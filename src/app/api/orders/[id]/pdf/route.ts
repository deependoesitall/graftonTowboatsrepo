// src/app/api/orders/[id]/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateOrderHTML } from '@/lib/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('id', id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const merged = { ...order } as typeof order;
  if (searchParams.has('delivery_fee')) merged.delivery_fee = Number(searchParams.get('delivery_fee')) || 0;
  if (searchParams.has('delivery_service_type')) merged.delivery_service_type = searchParams.get('delivery_service_type');
  if (searchParams.has('bill_for_groceries')) merged.bill_for_groceries = searchParams.get('bill_for_groceries') === 'true';
  if (searchParams.has('register_total')) merged.register_total = Number(searchParams.get('register_total')) || null;

  const html = generateOrderHTML(merged as any);

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
