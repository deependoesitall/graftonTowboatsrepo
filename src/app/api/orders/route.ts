// src/app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createClient as createSupabaseJs } from '@supabase/supabase-js';

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
import { requireAdmin, hasPermission } from '@/lib/admin-auth-server';
import { z } from 'zod';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const submitSchema = z.object({
  vessel: z.object({
    company_name: z.string().min(1),
    contact_name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().min(1).refine(v => EMAIL_RE.test(v.trim()), 'Invalid email address'),
    po_number: z.string().optional().default(''),
    vessel_name: z.string().optional().default(''),
    vessel_type: z.string().optional().default(''),
    vessel_type_other: z.string().optional().default(''),
    captain_name: z.string().optional().default(''),
    captain_phone: z.string().optional().default(''),
    vessel_email: z.string().optional().default(''),
    order_contact_name: z.string().optional().default(''),
    order_contact_title: z.string().optional().default(''),
    order_contact_phone: z.string().optional().default(''),
    order_contact_email: z.string().optional().default(''),
    terminal_name: z.string().optional().default(''),
    arrival_date: z.string().optional().default(''),
    arrival_time: z.string().optional().default(''),
    delivery_method: z.enum(['boat', 'van', '']).optional().default(''),
    approach_side: z.enum(['port', 'starboard', 'either', '']).optional().default(''),
    vhf_channel: z.string().optional().default(''),
    secondary_terminal_name: z.string().optional().default(''),
    secondary_arrival_date: z.string().optional().default(''),
    secondary_arrival_time: z.string().optional().default(''),
    secondary_delivery_method: z.enum(['boat', 'van', '']).optional().default(''),
    crew_change: z.boolean().optional().default(false),
    crew_arriving: z.string().optional().default(''),
    crew_departing: z.string().optional().default(''),
    notes: z.string().optional().default(''),
    eta: z.string().optional().default(''),
  }),
  items: z.array(z.object({
    product_id: z.string(),
    description: z.string(),
    category: z.string(),
    pkg_size: z.string().nullable().optional(),
    uom: z.string().nullable().optional(),
    price: z.number(),
    quantity: z.number().int().positive(),
  })).default([]),
  services: z.object({
    parts_pickup: z.object({
      enabled: z.boolean(),
      pickup_location: z.string().optional().default(''),
      order_number: z.string().optional().default(''),
      contact_name: z.string().optional().default(''),
      contact_phone: z.string().optional().default(''),
    }).optional(),
    package_delivery: z.object({
      enabled: z.boolean(),
      description: z.string().optional().default(''),
      origin: z.string().optional().default(''),
      contact_name: z.string().optional().default(''),
      contact_phone: z.string().optional().default(''),
    }).optional(),
  }).optional().default({}),
}).refine(data => {
  const hasItems = data.items.length > 0;
  const hasSvc = data.services?.parts_pickup?.enabled || data.services?.package_delivery?.enabled;
  return hasItems || hasSvc;
}, { message: 'Order must have at least one item or service' });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid order data', details: parsed.error.issues }, { status: 400 });
    }

    const { vessel, items, services } = parsed.data;
    const supabase = createServiceClient();
    const orderNumber = generateOrderNumber();
    const userId = await getUserIdFromToken(req);
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

    const vesselTypeStored = vessel.vessel_type === 'Other'
      ? (vessel.vessel_type_other || 'Other')
      : (vessel.vessel_type || null);

    const extendedInfo: Record<string, string> = {};
    if (vessel.order_contact_name)        extendedInfo.order_contact_name        = vessel.order_contact_name;
    if (vessel.order_contact_title)       extendedInfo.order_contact_title       = vessel.order_contact_title;
    if (vessel.order_contact_phone)       extendedInfo.order_contact_phone       = vessel.order_contact_phone;
    if (vessel.order_contact_email)       extendedInfo.order_contact_email       = vessel.order_contact_email;
    if (vessel.secondary_terminal_name)   extendedInfo.secondary_terminal_name   = vessel.secondary_terminal_name;
    if (vessel.secondary_arrival_date)    extendedInfo.secondary_arrival_date    = vessel.secondary_arrival_date;
    if (vessel.secondary_arrival_time)    extendedInfo.secondary_arrival_time    = vessel.secondary_arrival_time;
    if (vessel.secondary_delivery_method) extendedInfo.secondary_delivery_method = vessel.secondary_delivery_method;
    if (vessel.vessel_type === 'Other' && vessel.vessel_type_other)
      extendedInfo.vessel_type_raw = vessel.vessel_type_other;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        company_name: vessel.company_name,
        contact_name: vessel.contact_name,
        phone: vessel.phone,
        customer_email: vessel.email.trim().toLowerCase(),
        po_number: vessel.po_number || null,
        vessel_name: vessel.vessel_name || null,
        vessel_type: vesselTypeStored,
        captain_name: vessel.captain_name || null,
        captain_phone: vessel.captain_phone || null,
        vessel_email: vessel.vessel_email || null,
        delivery_method: vessel.delivery_method || null,
        terminal_name: vessel.terminal_name || null,
        arrival_date: vessel.arrival_date || null,
        arrival_time: vessel.arrival_time || null,
        approach_side: vessel.approach_side || null,
        vhf_channel: vessel.vhf_channel || null,
        crew_change: vessel.crew_change ?? false,
        crew_arriving: vessel.crew_arriving ? parseInt(vessel.crew_arriving, 10) : null,
        crew_departing: vessel.crew_departing ? parseInt(vessel.crew_departing, 10) : null,
        extended_info: Object.keys(extendedInfo).length > 0 ? extendedInfo : null,
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

    const allOrderItems: Record<string, unknown>[] = [];

    if (items.length > 0) {
      const productIds = items.map(i => i.product_id).filter(Boolean);
      const { data: products } = await supabase.from('products').select('id, upc').in('id', productIds);
      const upcMap: Record<string, string | null> = {};
      (products || []).forEach((p: { id: string; upc: string | null }) => { upcMap[p.id] = p.upc; });

      items.forEach(item => {
        allOrderItems.push({
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
          item_type: 'grocery',
          service_type: null,
          service_details: null,
        });
      });
    }

    if (services?.parts_pickup?.enabled) {
      const p = services.parts_pickup;
      allOrderItems.push({
        order_id: order.id,
        product_id: 'service-parts-pickup',
        description: 'Parts Pickup',
        category: 'Additional Services',
        pkg_size: null, uom: null, upc: null,
        unit_price: 0, quantity: 1, line_total: 0,
        item_type: 'service',
        service_type: 'parts_pickup',
        service_details: {
          pickup_location: p.pickup_location || '',
          order_number: p.order_number || '',
          contact_name: p.contact_name || '',
          contact_phone: p.contact_phone || '',
        },
      });
    }

    if (services?.package_delivery?.enabled) {
      const d = services.package_delivery;
      allOrderItems.push({
        order_id: order.id,
        product_id: 'service-package-delivery',
        description: 'Package Delivery',
        category: 'Additional Services',
        pkg_size: null, uom: null, upc: null,
        unit_price: 0, quantity: 1, line_total: 0,
        item_type: 'service',
        service_type: 'package_delivery',
        service_details: {
          description: d.description || '',
          origin: d.origin || '',
          contact_name: d.contact_name || '',
          contact_phone: d.contact_phone || '',
        },
      });
    }

    if (allOrderItems.length > 0) {
      await supabase.from('order_items').insert(allOrderItems);
    }

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

  const isSinclair = hasPermission(session, 'sinclair');

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

  // Sinclair users only see orders that have at least one grocery item
  if (isSinclair) {
    const { data: groceryOrderIds } = await supabase
      .from('order_items')
      .select('order_id')
      .eq('item_type', 'grocery');
    const ids = (groceryOrderIds || []).map((r: { order_id: string }) => r.order_id);
    query = ids.length > 0 ? query.in('id', ids) : query.eq('id', 'no-match');
  }

  const [{ data, count, error }, { data: statusRows }] = await Promise.all([
    query,
    // Status counts: apply same filter so tab numbers match what Sinclair sees
    isSinclair
      ? (async () => {
          const { data: ids } = await supabase.from('order_items').select('order_id').eq('item_type', 'grocery');
          const filtered = (ids || []).map((r: { order_id: string }) => r.order_id);
          if (!filtered.length) return { data: [] };
          return supabase.from('orders').select('status').in('id', filtered);
        })()
      : supabase.from('orders').select('status'),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const status_counts: Record<string, number> = { new: 0, in_progress: 0, fulfilled: 0, cancelled: 0 };
  (statusRows || []).forEach((r: { status: string }) => {
    if (r.status in status_counts) status_counts[r.status]++;
  });

  return NextResponse.json({ orders: data, total: count, page, per_page: perPage, status_counts });
}
