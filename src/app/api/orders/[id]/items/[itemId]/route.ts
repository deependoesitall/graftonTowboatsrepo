// src/app/api/orders/[id]/items/[itemId]/route.ts
// Phase 2a: Per-item shopping mode actions for staff.
//
// PATCH /api/orders/:id/items/:itemId
// Body shapes:
//   { "action": "shopped" }
//   { "action": "out_of_stock", "substitution": { "product_id": "uuid", "quantity": 2 } }
//   { "action": "set_weight", "actual_weight": 2.4 }

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { z } from 'zod';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('shopped') }),
  z.object({
    action: z.literal('out_of_stock'),
    substitution: z.object({
      product_id: z.string().uuid(),
      quantity: z.number().int().positive(),
    }),
  }),
  z.object({
    action: z.literal('set_weight'),
    actual_weight: z.number().positive(),
  }),
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = requireAdmin(req, { area: 'orders', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { id: orderId, itemId } = await params;
  const supabase = createServiceClient();

  const raw = await req.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action', details: parsed.error.issues }, { status: 400 });
  }

  // Verify the item belongs to this order
  const { data: item, error: itemErr } = await supabase
    .from('order_items')
    .select('*')
    .eq('id', itemId)
    .eq('order_id', orderId)
    .single();

  if (itemErr || !item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const { action } = parsed.data;

  // ── SHOPPED ───────────────────────────────────────────────────────────────
  if (action === 'shopped') {
    const { data: updated, error } = await supabase
      .from('order_items')
      .update({ shopping_status: 'shopped' })
      .eq('id', itemId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: updated });
  }

  // ── SET WEIGHT ────────────────────────────────────────────────────────────
  if (action === 'set_weight') {
    const { actual_weight } = parsed.data;
    const actual_total = actual_weight * item.unit_price * item.quantity;

    const { data: updated, error } = await supabase
      .from('order_items')
      .update({ shopping_status: 'shopped', actual_weight, actual_total })
      .eq('id', itemId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: updated });
  }

  // ── OUT OF STOCK + SUBSTITUTION ───────────────────────────────────────────
  if (action === 'out_of_stock') {
    const { substitution } = parsed.data;

    // Look up the replacement product
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .eq('id', substitution.product_id)
      .eq('is_active', true)
      .single();

    if (prodErr || !product) {
      return NextResponse.json({ error: 'Replacement product not found' }, { status: 404 });
    }

    // Mark original item as out_of_stock
    const { error: markErr } = await supabase
      .from('order_items')
      .update({ shopping_status: 'out_of_stock' })
      .eq('id', itemId);

    if (markErr) return NextResponse.json({ error: markErr.message }, { status: 500 });

    // Create substitution item
    const lineTotal = product.price * substitution.quantity;
    const { data: subItem, error: subErr } = await supabase
      .from('order_items')
      .insert({
        order_id: orderId,
        product_id: product.id,
        description: product.description,
        category: product.category,
        pkg_size: product.pkg_size || null,
        uom: product.uom || null,
        upc: product.upc || null,
        unit_price: product.price,
        quantity: substitution.quantity,
        line_total: lineTotal,
        shopping_status: 'shopped',
        is_substitution: true,
        substitutes_item_id: itemId,
      })
      .select()
      .single();

    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });

    // Return both updated original and new substitution
    const { data: originalUpdated } = await supabase
      .from('order_items')
      .select('*')
      .eq('id', itemId)
      .single();

    return NextResponse.json({ item: originalUpdated, substitution: subItem });
  }

  return NextResponse.json({ error: 'Unhandled action' }, { status: 400 });
}
