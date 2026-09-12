// src/app/api/orders/[id]/items/route.ts
// POST: Add a line to an existing order mid-fulfill (admin only).
// Supports catalog grocery (with paid_by), write-in / external grocery,
// and additional services — mirroring place-order snapshot fields.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, isSinclairScoped } from '@/lib/admin-auth-server';
import { z } from 'zod';
import { recalcSubtotal } from '@/lib/recalc-subtotal';

const paidBySchema = z.enum(['vessel', 'deck', 'cod']);

const catalogSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive().max(999),
  paid_by: paidBySchema.optional().default('vessel'),
  cod_name: z.string().max(80).optional().default(''),
  item_type: z.literal('grocery').optional(),
});

const writeInSchema = z.object({
  // No product_id — off-shelf cigarettes etc. Sinclair picks up / rings later.
  description: z.string().min(1).max(200),
  quantity: z.number().positive().max(999),
  unit_price: z.number().min(0).max(100000),
  paid_by: paidBySchema.optional().default('cod'),
  cod_name: z.string().max(80).optional().default(''),
  item_type: z.literal('grocery').optional().default('grocery'),
  category: z.string().max(80).optional(),
});

const partsPickupSchema = z.object({
  item_type: z.literal('service'),
  service_type: z.literal('parts_pickup'),
  pickup_location: z.string().max(200).optional().default(''),
  order_number: z.string().max(80).optional().default(''),
  contact_name: z.string().max(80).optional().default(''),
  contact_phone: z.string().max(40).optional().default(''),
});

const packageDeliverySchema = z.object({
  item_type: z.literal('service'),
  service_type: z.literal('package_delivery'),
  description: z.string().max(200).optional().default(''),
  origin: z.string().max(200).optional().default(''),
  contact_name: z.string().max(80).optional().default(''),
  contact_phone: z.string().max(40).optional().default(''),
});

const otherPickupSchema = z.object({
  item_type: z.literal('service'),
  service_type: z.literal('other_pickup'),
  url: z.string().max(500).optional().default(''),
  notes: z.string().max(500).optional().default(''),
  // other_pickup uses grocery|cod in service_details (place-order shape)
  paid_by: z.enum(['grocery', 'cod']).optional().default('grocery'),
  cod_name: z.string().max(80).optional().default(''),
});

const addItemSchema = z.union([
  catalogSchema,
  writeInSchema,
  partsPickupSchema,
  packageDeliverySchema,
  otherPickupSchema,
]);

function normalizePaidBy(paid_by: 'vessel' | 'deck' | 'cod' | undefined, cod_name: string | undefined) {
  const pb = paid_by === 'cod' ? 'cod' : paid_by === 'deck' ? 'deck' : 'vessel';
  return {
    paid_by: pb as 'vessel' | 'deck' | 'cod',
    cod_name: pb === 'cod' ? ((cod_name || '').trim() || null) : null,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = requireAdmin(req, { area: 'orders', editRequired: true });
  if (session instanceof NextResponse) return session;

  const sinclairScoped = isSinclairScoped(session);
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

  const data = parsed.data;

  // COD grocery / write-in needs a crew name
  if ('paid_by' in data && data.paid_by === 'cod' && !(data.cod_name || '').trim()) {
    // other_pickup uses paid_by grocery|cod inside service_details
    if (!('service_type' in data)) {
      return NextResponse.json(
        { error: 'COD items need the crew member\'s name (cod_name).' },
        { status: 400 },
      );
    }
  }
  if ('service_type' in data && data.service_type === 'other_pickup') {
    const op = data as z.infer<typeof otherPickupSchema>;
    if (op.paid_by === 'cod' && !(op.cod_name || '').trim()) {
      return NextResponse.json(
        { error: 'COD outside pickups need the crew member\'s name (cod_name).' },
        { status: 400 },
      );
    }
    if (!(op.url || '').trim() && !(op.notes || '').trim()) {
      return NextResponse.json(
        { error: 'Outside pickup needs a link or notes.' },
        { status: 400 },
      );
    }
  }

  // GTS-only services (match list filter: Sinclair sees grocery + other_pickup only)
  if (
    'service_type' in data
    && (data.service_type === 'parts_pickup' || data.service_type === 'package_delivery')
    && sinclairScoped
  ) {
    return NextResponse.json(
      { error: 'Only Grafton Towboat staff can add Parts Pickup or Package Delivery.' },
      { status: 403 },
    );
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('id', orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // ── CATALOG GROCERY ───────────────────────────────────────────────────────
  if ('product_id' in data && data.product_id) {
    const { product_id, quantity, paid_by, cod_name } = data as z.infer<typeof catalogSchema>;

    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('id, description, category, pkg_size, uom, upc, price, location, location_seq, image_url, is_active, regular_price, sale_finish_date')
      .eq('id', product_id)
      .eq('is_active', true)
      .single();

    if (prodErr || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const billing = normalizePaidBy(paid_by, cod_name);
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
        location_seq: product.location_seq ?? null,
        image_url: product.image_url || null,
        unit_price: product.price,
        quantity,
        line_total: lineTotal,
        item_type: 'grocery',
        service_type: null,
        service_details: null,
        paid_by: billing.paid_by,
        cod_name: billing.cod_name,
        regular_price: (product as { regular_price?: number | null }).regular_price ?? null,
        sale_finish_date: (product as { sale_finish_date?: string | null }).sale_finish_date ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recalcSubtotal(supabase, orderId);
    return NextResponse.json({ item: newItem }, { status: 201 });
  }

  // ── WRITE-IN / EXTERNAL GROCERY ───────────────────────────────────────────
  if (!('service_type' in data)) {
    const wi = data as z.infer<typeof writeInSchema>;
    const billing = normalizePaidBy(wi.paid_by, wi.cod_name);
    const lineTotal = wi.unit_price * wi.quantity;

    const { data: newItem, error } = await supabase
      .from('order_items')
      .insert({
        order_id: orderId,
        product_id: null,
        description: wi.description.trim(),
        category: (wi.category || 'Write-in').trim() || 'Write-in',
        pkg_size: null,
        uom: null,
        upc: null,
        location: null,
        location_seq: null,
        image_url: null,
        unit_price: wi.unit_price,
        quantity: wi.quantity,
        line_total: lineTotal,
        item_type: 'grocery',
        service_type: null,
        service_details: null,
        paid_by: billing.paid_by,
        cod_name: billing.cod_name,
        regular_price: null,
        sale_finish_date: null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recalcSubtotal(supabase, orderId);
    return NextResponse.json({ item: newItem }, { status: 201 });
  }

  // ── SERVICES ──────────────────────────────────────────────────────────────
  const svc = data as
    | z.infer<typeof partsPickupSchema>
    | z.infer<typeof packageDeliverySchema>
    | z.infer<typeof otherPickupSchema>;

  let row: Record<string, unknown>;

  if (svc.service_type === 'parts_pickup') {
    const p = svc as z.infer<typeof partsPickupSchema>;
    row = {
      order_id: orderId,
      product_id: null,
      description: 'Parts Pickup',
      category: 'Additional Services',
      pkg_size: null, uom: null, upc: null,
      location: null, location_seq: null, image_url: null,
      unit_price: 0, quantity: 1, line_total: 0,
      item_type: 'service',
      service_type: 'parts_pickup',
      service_details: {
        pickup_location: p.pickup_location || '',
        order_number: p.order_number || '',
        contact_name: p.contact_name || '',
        contact_phone: p.contact_phone || '',
      },
      paid_by: 'vessel',
      cod_name: null,
      regular_price: null,
      sale_finish_date: null,
    };
  } else if (svc.service_type === 'package_delivery') {
    const d = svc as z.infer<typeof packageDeliverySchema>;
    row = {
      order_id: orderId,
      product_id: null,
      description: 'Package Delivery',
      category: 'Additional Services',
      pkg_size: null, uom: null, upc: null,
      location: null, location_seq: null, image_url: null,
      unit_price: 0, quantity: 1, line_total: 0,
      item_type: 'service',
      service_type: 'package_delivery',
      service_details: {
        description: d.description || '',
        origin: d.origin || '',
        contact_name: d.contact_name || '',
        contact_phone: d.contact_phone || '',
      },
      paid_by: 'vessel',
      cod_name: null,
      regular_price: null,
      sale_finish_date: null,
    };
  } else {
    const o = svc as z.infer<typeof otherPickupSchema>;
    const paid = o.paid_by === 'cod' ? 'cod' : 'grocery';
    row = {
      order_id: orderId,
      product_id: null,
      description: 'Other Third-Party Item (Sinclair\'s)',
      category: 'Additional Services',
      pkg_size: null, uom: null, upc: null,
      location: null, location_seq: null, image_url: null,
      unit_price: 0, quantity: 1, line_total: 0,
      item_type: 'service',
      service_type: 'other_pickup',
      service_details: {
        url: (o.url || '').trim(),
        notes: (o.notes || '').trim(),
        paid_by: paid,
        cod_name: paid === 'cod' ? (o.cod_name || '').trim() : '',
      },
      paid_by: 'vessel',
      cod_name: null,
      regular_price: null,
      sale_finish_date: null,
    };
  }

  const { data: newItem, error } = await supabase
    .from('order_items')
    .insert(row)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recalcSubtotal(supabase, orderId);
  return NextResponse.json({ item: newItem }, { status: 201 });
}
