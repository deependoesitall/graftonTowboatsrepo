// src/app/api/orders/[id]/items/[itemId]/route.ts
// Phase 2a: Per-item shopping mode actions for staff.
// Phase 2b: Auto-advance order to in_progress on first item action.
// Task 14: update_quantity action + DELETE for admin item editing.
//
// PATCH /api/orders/:id/items/:itemId
// Body shapes:
//   { "action": "shopped" }
//   { "action": "out_of_stock", "substitution": { "product_id": "uuid", "quantity": 2 } }
//   { "action": "set_weight", "actual_weight": 2.4 }
//   { "action": "update_quantity", "quantity": 3 }
//
// DELETE /api/orders/:id/items/:itemId

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { z } from 'zod';
import { recalcSubtotal } from '@/lib/recalc-subtotal';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('shopped') }),
  z.object({
    action: z.literal('out_of_stock'),
    // OPTIONAL. Dave, at the demo: "let's say you wanted to do substitutions of
    // something's completely out of stock". Sometimes there's nothing to swap
    // in — the line is simply unavailable and drops off the bill. Requiring a
    // replacement forced staff to invent one.
    substitution: z.object({
      product_id: z.string().uuid(),
      // Decimals allowed: by-weight subs are in lb increments
      quantity: z.number().positive().max(999),
    }).optional(),
  }),
  z.object({
    action: z.literal('set_weight'),
    actual_weight: z.number().positive(),
  }),
  z.object({
    action: z.literal('update_quantity'),
    quantity: z.number().positive().max(999),
  }),
  // Undo a shopped / out-of-stock mark (fat-finger fix): back to pending,
  // clears weight, and removes any substitution children.
  z.object({ action: z.literal('reset') }),
  // Price an OUTSIDE PICKUP once Sinclair's has actually bought it. A Walmart
  // link has no price at order time, so the line sits at $0 — which means it
  // contributes nothing to the COD total and the handling fee comes out short.
  // Dave: "because the TV isn't the price of it, it's just a link... you're
  // able to add in your manual charge."
  z.object({
    action: z.literal('set_price'),
    unit_price: z.number().min(0).max(100000),
  }),
]);

/** If the order is still 'new', advance it to 'in_progress' (first item action). */
async function maybeAdvanceToInProgress(supabase: ReturnType<typeof createServiceClient>, orderId: string) {
  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single();

  if (order?.status === 'new') {
    await supabase
      .from('orders')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', orderId);
  }
}

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

    await maybeAdvanceToInProgress(supabase, orderId);

    return NextResponse.json({ item: updated });
  }

  // ── SET WEIGHT ────────────────────────────────────────────────────────────
  if (action === 'set_weight') {
    const { actual_weight } = parsed.data;
    const actual_total = actual_weight * item.unit_price;

    const { data: updated, error } = await supabase
      .from('order_items')
      .update({ shopping_status: 'shopped', actual_weight, actual_total })
      .eq('id', itemId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await maybeAdvanceToInProgress(supabase, orderId);

    return NextResponse.json({ item: updated });
  }

  // ── OUT OF STOCK + SUBSTITUTION ───────────────────────────────────────────
  if (action === 'out_of_stock') {
    const { substitution } = parsed.data;

    // No replacement — the line is just unavailable. Marked out_of_stock, which
    // every total already excludes and the pick sheet prints without a barcode.
    if (!substitution) {
      const { data: updated, error } = await supabase
        .from('order_items')
        .update({ shopping_status: 'out_of_stock' })
        .eq('id', itemId)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await maybeAdvanceToInProgress(supabase, orderId);
      return NextResponse.json({ item: updated });
    }

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
        // INHERIT THE BILLING from the line being replaced. Without this the
        // substitute defaulted to 'vessel', so swapping Andy's COD Tylenol put
        // the replacement on the company invoice and Andy was never charged.
        // Same for deck lines, which must stay off the grocery allowance.
        paid_by: item.paid_by ?? 'vessel',
        cod_name: item.cod_name ?? null,
        // Carry the shelf location too, or the substitute sorts into the
        // "no location" bucket at the end of the walk instead of next to the
        // item it replaces.
        location: product.location ?? item.location ?? null,
        location_seq: product.location_seq ?? item.location_seq ?? null,
        image_url: product.image_url ?? null,
      })
      .select()
      .single();

    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });

    await maybeAdvanceToInProgress(supabase, orderId);

    // Return both updated original and new substitution
    const { data: originalUpdated } = await supabase
      .from('order_items')
      .select('*')
      .eq('id', itemId)
      .single();

    return NextResponse.json({ item: originalUpdated, substitution: subItem });
  }

  // ── SET PRICE (outside pickups) ───────────────────────────────────────────
  if (action === 'set_price') {
    const { unit_price } = parsed.data;
    // Guard the concept, not just the type: pricing a grocery line here would
    // silently overwrite Sinclair's own shelf price.
    if (item.service_type !== 'other_pickup') {
      return NextResponse.json(
        { error: 'Only outside pickups can be priced by hand — grocery prices come from the catalogue.' },
        { status: 400 },
      );
    }
    const qty = Number(item.quantity) || 1;
    const { data: updated, error } = await supabase
      .from('order_items')
      .update({ unit_price, line_total: unit_price * qty, shopping_status: 'shopped' })
      .eq('id', itemId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await maybeAdvanceToInProgress(supabase, orderId);
    return NextResponse.json({ item: updated });
  }

  // ── RESET (undo shopped / out-of-stock) ───────────────────────────────────
  if (action === 'reset') {
    // Remove substitution children first — they only exist because of the
    // out-of-stock mark we're undoing.
    const { error: subDelErr } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', orderId)
      .eq('substitutes_item_id', itemId);
    if (subDelErr) return NextResponse.json({ error: subDelErr.message }, { status: 500 });

    const { data: updated, error } = await supabase
      .from('order_items')
      .update({ shopping_status: 'pending', actual_weight: null, actual_total: null })
      .eq('id', itemId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recalcSubtotal(supabase, orderId);

    return NextResponse.json({ item: updated });
  }

  // ── UPDATE QUANTITY ───────────────────────────────────────────────────────
  if (action === 'update_quantity') {
    const { quantity } = parsed.data;
    const lineTotal = item.unit_price * quantity;
    const actual_total = item.actual_weight != null ? item.actual_weight * item.unit_price : null;

    const { data: updated, error } = await supabase
      .from('order_items')
      .update({ quantity, line_total: lineTotal, actual_total })
      .eq('id', itemId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recalcSubtotal(supabase, orderId);

    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: 'Unhandled action' }, { status: 400 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = requireAdmin(req, { area: 'orders', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { id: orderId, itemId } = await params;
  const supabase = createServiceClient();

  // Verify item belongs to this order
  const { data: item, error: itemErr } = await supabase
    .from('order_items')
    .select('id, is_substitution, substitutes_item_id')
    .eq('id', itemId)
    .eq('order_id', orderId)
    .single();

  if (itemErr || !item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // If deleting an original item that has substitutions, also delete those
  await supabase.from('order_items').delete().eq('substitutes_item_id', itemId);

  const { error } = await supabase.from('order_items').delete().eq('id', itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recalcSubtotal(supabase, orderId);

  return NextResponse.json({ success: true });
}
