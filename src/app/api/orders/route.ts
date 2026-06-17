// src/app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createClient as createSupabaseJs } from '@supabase/supabase-js';

// Verify a Supabase access token and return the user id (or null for guests)
async function getUserIdFromToken(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const supabase = createSupabaseJs(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch { return null; }
}

import { generateOrderNumber } from '@/lib/utils';
import { sendOrderReceivedEmail } from '@/lib/email';
import { Order } from '@/types';
import { requireAdmin } from '@/lib/admin-auth-server';
import { z } from 'zod';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const submitSchema = z.object({
  vessel: z.object({
    company_name: z.string().min(1),
    contact_name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().min(1).refine(v => EMAIL_RE.test(v.trim()), 'Invalid email address'),
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
    const userId = await getUserIdFromToken(req);
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        company_name: vessel.company_name,
        contact_name: vessel.contact_name,
        phone: vessel.phone,
        customer_email: vessel.email.trim().toLowerCase(),
        po_number: vessel.po_number || null,
        notes: vessel.notes || null,
        eta: vessel.eta || null,
        subtotal,
        status: 'new',
        user_id: userId,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error('Order insert error:', orderError);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    // Fetch UPCs for all product_ids so we can snapshot them in order_items
    const productIds = items.map(i => i.product_id).filter(Boolean);
    const { data: products } = await supabase
      .from('products')
      .select('id, upc')
      .in('id', productIds);
    const upcMap: Record<string, string | null> = {};
    (products || []).forEach((p: { id: string; upc: string | null }) => {
      upcMap[p.id] = p.upc;
    });

    const orderItems = items.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      description: item.description,
      category: item.category,
      pkg_size: item.pkg_size || null,
      uom: item.uom || null,
      upc: upcMap[item.product_id] ?? null,
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

    let emailDebug: { ok: boolean; to?: string; id?: string; error?: string } | null = null;
    let debugEnabled = false;

    if (fullOrder) {
      try {
        const { data: s } = await supabase
          .from('admin_settings')
          .select('business_email, order_email_cc, email_debug_enabled, order_email_subject, email_header_tagline, email_intro_message, email_footer_text, email_button_text, email_button_url')
          .single();
        debugEnabled = !!s?.email_debug_enabled;

        const result = await sendOrderReceivedEmail(fullOrder as Order, {
          businessEmail: s?.business_email || process.env.BUSINESS_EMAIL,
          ccEmailRaw: s?.order_email_cc,
          template: {
            subject_template: s?.order_email_subject,
            header_tagline: s?.email_header_tagline,
            intro_message: s?.email_intro_message,
            footer_text: s?.email_footer_text,
            button_text: s?.email_button_text,
            button_url: s?.email_button_url,
          },
        });
        emailDebug = { ok: true, to: s?.business_email, id: (result as { data?: { id?: string } })?.data?.id };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Email error:', err);
        emailDebug = { ok: false, error: message };
      }
    }

    return NextResponse.json({
      order_id: order.id,
      order_number: orderNumber,
      ...(debugEnabled ? { _emailDebug: emailDebug } : {}),
    });
  } catch (err) {
    console.error('Order creation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'orders' });
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const perPage = parseInt(searchParams.get('per_page') || '25');
  const offset = (page - 1) * perPage;
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const supabase = createServiceClient();

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

  const status_counts: Record<string, number> = { new: 0, in_progress: 0, fulfilled: 0, cancelled: 0 };
  (statusRows || []).forEach((r: { status: string }) => {
    if (r.status in status_counts) status_counts[r.status]++;
  });

  return NextResponse.json({ orders: data, total: count, page, per_page: perPage, status_counts });
}
