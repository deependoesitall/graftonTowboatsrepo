// src/app/api/orders/[id]/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateOrderHTML } from '@/lib/pdf';
import { normalizeGroceryHandlingFee } from '@/lib/grocery-handling-fee';

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
  // Boat dashboard and the confirmation download. Sinclair's charges only —
  // Grafton's delivery fee stays off this file.
  const showGtsCharges = searchParams.get('audience') !== 'customer';
  const merged = { ...order } as typeof order;
  if (showGtsCharges && searchParams.has('delivery_fee')) merged.delivery_fee = Number(searchParams.get('delivery_fee')) || 0;
  if (showGtsCharges && searchParams.has('delivery_service_type')) merged.delivery_service_type = searchParams.get('delivery_service_type');
  if (showGtsCharges && searchParams.has('bill_for_groceries')) merged.bill_for_groceries = searchParams.get('bill_for_groceries') === 'true';
  if (showGtsCharges && searchParams.has('register_total')) merged.register_total = Number(searchParams.get('register_total')) || null;
  if (showGtsCharges && searchParams.has('grocery_handling_fee')) {
    merged.grocery_handling_fee = normalizeGroceryHandlingFee(searchParams.get('grocery_handling_fee'));
  }
  // ⚠️ A TWO-SERVICE BILL CANNOT BE DESCRIBED BY A FEE AND A LABEL, so the
  // preview takes the whole breakdown. Parsed defensively: this is a query
  // string, and a preview that throws is worse than one that falls back to the
  // fee it already has.
  if (showGtsCharges && searchParams.has('service_charges')) {
    try {
      const parsed = JSON.parse(searchParams.get('service_charges') || '[]');
      if (Array.isArray(parsed)) {
        (merged as unknown as { service_charges: unknown }).service_charges = parsed;
      }
    } catch { /* keep whatever the stored order has */ }
  }

  const html = generateOrderHTML(merged as any, { showGtsCharges });

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
