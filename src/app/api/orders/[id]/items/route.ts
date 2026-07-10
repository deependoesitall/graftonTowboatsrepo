// src/app/api/orders/[id]/items/route.ts
// POST: Add a new product line item to an existing order (admin only).

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { z } from 'zod';
import { recalcSubtotal } from '@/lib/recalc-subtotal';

const addItemSchema = z.object({
  product_id: z.string().uuid(),
  // Decimals allowed: by-weight items are ordered in lb increments
  quantity: z.number().positive().max(999),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = requireAdmin(req, { area: 'orders', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { id: orderId } = await params;
  const supabase = createServiceClient();

  const raw = await req.json();
  const parsed = addItemSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { product_id, quantity } = parsed.data;

  // Verify order exists
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('id', orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Look up active product
  const { data: product, error: prodErr } = await supabase
    .from('products')
    .select('id, description, category, pkg_size, uom, upc, price, location, is_active')
    .eq('id', product_id)
    .eq('is_active', true)
    .single();

  if (prodErr || !product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const lineTotal = product.price * quantity;

  const { data: newItem, error } = await supabase
    .from('order_items')
    .insert({
      order_id: orderId,
      product_id: product.id,
      description: product.description,
      category: product.category,
      pkg_size: product.pkg_size || null,
      uom: product.uom || null,
      upc: product.upc || null,
      location: product.location || null,
      unit_price: product.price,
      quantity,
      line_total: lineTotal,
      item_type: 'grocery',
      service_type: null,
      service_details: null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recalcSubtotal(supabase, orderId);

  return NextResponse.json({ item: newItem }, { status: 201 });
}
