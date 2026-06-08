// src/app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateOrderNumber } from '@/lib/utils';
import { sendOrderEmail } from '@/lib/email';
import { Order } from '@/types';
import { z } from 'zod';

const submitSchema = z.object({
  vessel: z.object({
    company_name: z.string().min(1),
    contact_name: z.string().min(1),
    phone: z.string().min(1),
    po_number: z.string().optional(),
    notes: z.string().optional(),
    eta: z.string().optional(),
  }),
  items: z.array(
    z.object({
      product_id: z.string(),
      description: z.string(),
      category: z.string(),
      pkg_size: z.string().nullable().optional(),
      uom: z.string().nullable().optional(),
      price: z.number(),
      quantity: z.number().int().positive(),
    })
  ).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = submitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid order data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { vessel, items } = parsed.data;
    const supabase = createServiceClient();
    const orderNumber = generateOrderNumber();
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        company_name: vessel.company_name,
        contact_name: vessel.contact_name,
        phone: vessel.phone,
        po_number: vessel.po_number || null,
        notes: vessel.notes || null,
        eta: vessel.eta || null,
        subtotal,
        status: 'new',
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error('Order insert error:', orderError);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    const orderItems = items.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      description: item.description,
      category: item.category,
      pkg_size: item.pkg_size || null,
      uom: item.uom || null,
      unit_price: item.price,
      quantity: item.quantity,
      line_total: item.price * item.quantity,
    }));

    await supabase.from('order_items').insert(orderItems);

    const { data: fullOrder } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', order.id)
      .single();

    if (fullOrder) {
      sendOrderEmail(fullOrder as Order).catch(err => console.error('Email error:', err));
    }

    return NextResponse.json({ order_id: order.id, order_number: orderNumber });
  } catch (err) {
    console.error('Order creation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-admin-token');
  if (authHeader !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const perPage = parseInt(searchParams.get('per_page') || '25');
  const offset = (page - 1) * perPage;
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const supabase = createServiceClient();

  // Run orders query and status counts in parallel
  let query = supabase
    .from('orders')
    .select('*, items:order_items(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + perPage - 1);

  if (status) query = query.eq('status', status);
  if (search) {
    query = query.or(
      `company_name.ilike.%${search}%,contact_name.ilike.%${search}%,order_number.ilike.%${search}%,phone.ilike.%${search}%`
    );
  }

  const [{ data, count, error }, { data: statusRows }] = await Promise.all([
    query,
    supabase.from('orders').select('status'),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build status counts from all orders (not filtered)
  const status_counts: Record<string, number> = { new: 0, in_progress: 0, fulfilled: 0, cancelled: 0 };
  (statusRows || []).forEach((r: { status: string }) => {
    if (r.status in status_counts) status_counts[r.status]++;
  });

  return NextResponse.json({ orders: data, total: count, page, per_page: perPage, status_counts });
}
