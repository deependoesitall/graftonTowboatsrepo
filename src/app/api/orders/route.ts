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
import { fetchActiveDeals, computeDiscounts } from '@/lib/sinclair-offers';
import { sendOrderReceivedEmail } from '@/lib/email';
import { Order } from '@/types';
import { requireAdmin, isSinclairScoped } from '@/lib/admin-auth-server';
import { z } from 'zod';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const submitSchema = z.object({
  vessel: z.object({
    company_name: z.string().min(1),
    contact_name: z.string().min(1),
    phone: z.string().min(1),
    // FLIPPED July 19 (Sinclair's demo): the VESSEL email is required — order
    // emails go to the boat, not the home office ("Ingram home office isn't
    // gonna want to see every time they place an order — they want the bill at
    // the end"). Billing email is now optional.
    email: z.string().optional().default('')
      .refine(v => !v.trim() || EMAIL_RE.test(v.trim()), 'Invalid billing email address'),
    po_number: z.string().optional().default(''),
    vessel_name: z.string().optional().default(''),
    vessel_type: z.string().optional().default(''),
    vessel_type_other: z.string().optional().default(''),
    captain_name: z.string().optional().default(''),
    captain_phone: z.string().optional().default(''),
    // Required by the UI; server also accepts legacy carts that only carry a
    // billing email (object-level refine below guarantees at least one email).
    vessel_email: z.string().optional().default('')
      .refine(v => !v.trim() || EMAIL_RE.test(v.trim()), 'Invalid vessel email address'),
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
    // Tri-state. z.preprocess keeps backwards compatibility with cached
    // clients that still submit the old boolean.
    crew_change: z.preprocess(
      v => (v === true ? 'yes' : v === false ? 'no' : v),
      z.enum(['yes', 'no', 'maybe']).optional().default('no')
    ),
    crew_change_notes: z.string().optional().default(''),
    crew_arriving: z.string().optional().default(''),
    crew_departing: z.string().optional().default(''),
    personal_cod_notes: z.string().optional().default(''),
    // 'cash' accepted for legacy saved carts only — no longer selectable in the UI
    cod_payment_method: z.enum(['cash', 'venmo', 'cashapp', 'credit_card', '']).optional().default(''),
    // Crew member's own @venmo / $cashtag — Sinclair's/GTS sends a payment REQUEST to it
    cod_payment_handle: z.string().max(80).optional().default(''),
    cod_preferred_phone: z.string().optional().default(''),
    cod_contact_time: z.string().optional().default(''),
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
    // Decimal quantities allowed: by-the-pound items order in lb increments
    // (¼ lb deli salad, 3 lb hamburger). Regular items still send whole counts.
    quantity: z.number().positive().max(999),
    image_url: z.string().nullable().optional(),
    // deck = company-billed but listed separately (not part of the grocery allowance)
    paid_by: z.enum(['vessel', 'deck', 'cod']).optional().default('vessel'),
    cod_name: z.string().optional().default(''),
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
    other_pickup: z.object({
      enabled: z.boolean(),
      // Multi-item form (no limit). Legacy clients may still send url/notes.
      items: z.array(z.object({
        url: z.string().optional().default(''),
        notes: z.string().optional().default(''),
      })).optional(),
      url: z.string().optional().default(''),
      notes: z.string().optional().default(''),
    }).optional(),
  }).optional().default({}),
}).refine(data => {
  const hasItems = data.items.length > 0;
  const hasSvc = data.services?.parts_pickup?.enabled
    || data.services?.package_delivery?.enabled
    || data.services?.other_pickup?.enabled;
  return hasItems || hasSvc;
}, { message: 'Order must have at least one item or service' })
// COD-only orders are blocked: Grafton delivers CODs for free as a goodwill
// service alongside a real delivery (vessel-account groceries, an additional
// service, or a crew change). There is no standalone COD-only order.
.refine(data => {
  const codItems = data.items.filter(i => i.paid_by === 'cod');
  if (codItems.length === 0 || codItems.length < data.items.length) return true;
  const hasSvc = data.services?.parts_pickup?.enabled
    || data.services?.package_delivery?.enabled
    || data.services?.other_pickup?.enabled;
  return !!hasSvc || data.vessel.crew_change !== 'no';
}, { message: 'COD items ride along with a regular delivery — please add vessel-account groceries, an additional service, or a crew change to this order.' })
// If anything is COD we need to know how it will be paid.
.refine(data => {
  const hasCod = data.items.some(i => i.paid_by === 'cod');
  return !hasCod || !!data.vessel.cod_payment_method;
}, { message: 'Please choose a payment method (Venmo, Cash App, or credit card) for the COD items.' })
// Venmo / Cash App need the crew member's own handle so we can send the request.
.refine(data => {
  const hasCod = data.items.some(i => i.paid_by === 'cod');
  const m = data.vessel.cod_payment_method;
  if (!hasCod || (m !== 'venmo' && m !== 'cashapp')) return true;
  return !!data.vessel.cod_payment_handle?.trim();
}, { message: 'Please add your Venmo username or Cash App $cashtag so we can send the payment request.' })
// We need SOME email to send the order confirmation to — vessel email is the
// primary (required in the UI); billing email alone still passes for legacy carts.
.refine(data => !!data.vessel.vessel_email?.trim() || !!data.vessel.email?.trim(),
  { message: 'Please add the vessel email address so we can send the order confirmation.' });

/**
 * Parse the structured ETA (date picker YYYY-MM-DD + time picker HH:MM) into
 * a Date. Returns null when unparseable (e.g. legacy free-text values), in
 * which case cutoff enforcement is skipped rather than blocking the order.
 */
function parseEta(arrivalDate: string, arrivalTime: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalDate)) return null;
  const time = /^\d{2}:\d{2}/.test(arrivalTime) ? arrivalTime.slice(0, 5) : '23:59';
  const d = new Date(`${arrivalDate}T${time}:00`);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid order data', details: parsed.error.issues }, { status: 400 });
    }

    const { vessel, items, services } = parsed.data;
    const supabase = createServiceClient();

    // ── Order cutoff enforcement (manager-configured buffer before ETA) ──
    const eta = parseEta(vessel.arrival_date, vessel.arrival_time);
    if (eta) {
      const { data: cfg } = await supabase
        .from('admin_settings')
        .select('grocery_cutoff_hours, service_cutoff_hours')
        .single();
      const hasGroceries = items.length > 0;
      const bufferHours = hasGroceries
        ? Number(cfg?.grocery_cutoff_hours ?? 4)
        : Number(cfg?.service_cutoff_hours ?? 2);
      if (bufferHours > 0) {
        const hoursUntilEta = (eta.getTime() - Date.now()) / 3_600_000;
        if (hoursUntilEta < bufferHours) {
          return NextResponse.json({
            error: `Orders must be placed at least ${bufferHours} hour${bufferHours === 1 ? '' : 's'} before your arrival time so we can shop and deliver. Your ETA is too soon — please adjust it, or call Grafton Towboat Services at (618) 556-0290 and we'll do our best to help.`,
            code: 'cutoff',
          }, { status: 400 });
        }
      }
    }
    const orderNumber = generateOrderNumber();
    const userId = await getUserIdFromToken(req);
    // Combined estimate (vessel + COD). Billing reports split these out and
    // exclude COD lines — they're settled at delivery, never invoiced.
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const hasCodItems = items.some(i => i.paid_by === 'cod');

    // COD handling fee — toggleable feature. Snapshot the effective percent
    // at order time (0 when disabled) so later setting changes don't rewrite
    // existing orders. Admin can still override per order afterward.
    let codFeePercent = 0;
    if (hasCodItems) {
      const { data: feeCfg } = await supabase
        .from('admin_settings')
        .select('cod_fee_enabled, cod_fee_percent')
        .single();
      codFeePercent = (feeCfg?.cod_fee_enabled ?? true)
        ? Number(feeCfg?.cod_fee_percent ?? 5)
        : 0;
    }

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
    if (vessel.personal_cod_notes)
      extendedInfo.personal_cod_notes = vessel.personal_cod_notes;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        company_name: vessel.company_name,
        contact_name: vessel.contact_name,
        phone: vessel.phone,
        customer_email: vessel.email.trim() ? vessel.email.trim().toLowerCase() : null,
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
        crew_change: vessel.crew_change ?? 'no',
        crew_change_notes: vessel.crew_change !== 'no' && vessel.crew_change_notes ? vessel.crew_change_notes : null,
        crew_arriving: vessel.crew_change === 'yes' && vessel.crew_arriving ? parseInt(vessel.crew_arriving, 10) : null,
        crew_departing: vessel.crew_change === 'yes' && vessel.crew_departing ? parseInt(vessel.crew_departing, 10) : null,
        extended_info: Object.keys(extendedInfo).length > 0 ? extendedInfo : null,
        cod_payment_method: hasCodItems ? (vessel.cod_payment_method || null) : null,
        cod_payment_handle: hasCodItems && (vessel.cod_payment_method === 'venmo' || vessel.cod_payment_method === 'cashapp')
          ? (vessel.cod_payment_handle?.trim() || null) : null,
        cod_preferred_phone: hasCodItems && vessel.cod_payment_method === 'credit_card' ? (vessel.cod_preferred_phone || null) : null,
        cod_contact_time: hasCodItems && vessel.cod_payment_method === 'credit_card' ? (vessel.cod_contact_time || null) : null,
        // COD handling fee snapshot (0 = feature toggled off) — admin-editable per order
        cod_fee_percent: hasCodItems ? codFeePercent : null,
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
    const freshopMap: Record<string, string | null> = {};

    if (items.length > 0) {
      const productIds = items.map(i => i.product_id).filter(Boolean);
      const { data: products } = await supabase.from('products').select('id, upc, location, location_seq, image_url, freshop_id').in('id', productIds);
      const upcMap: Record<string, string | null> = {};
      const locationMap: Record<string, string | null> = {};
      const locationSeqMap: Record<string, number | null> = {};
      const imageMap: Record<string, string | null> = {};
      (products || []).forEach((p: { id: string; upc: string | null; location: string | null; location_seq: number | null; image_url: string | null; freshop_id?: string | null }) => {
        upcMap[p.id] = p.upc;
        locationMap[p.id] = p.location;
        locationSeqMap[p.id] = p.location_seq;
        imageMap[p.id] = p.image_url;
        freshopMap[p.id] = p.freshop_id ?? null;
      });

      items.forEach(item => {
        allOrderItems.push({
          order_id: order.id,
          product_id: item.product_id,
          description: item.description,
          category: item.category,
          pkg_size: item.pkg_size || null,
          uom: item.uom || null,
          upc: upcMap[item.product_id] ?? null,
          location: locationMap[item.product_id] ?? null,
          location_seq: locationSeqMap[item.product_id] ?? null,
          image_url: item.image_url || imageMap[item.product_id] || null,
          unit_price: item.price,
          quantity: item.quantity,
          line_total: item.price * item.quantity,
          item_type: 'grocery',
          service_type: null,
          service_details: null,
          paid_by: item.paid_by === 'cod' ? 'cod' : item.paid_by === 'deck' ? 'deck' : 'vessel',
          cod_name: item.paid_by === 'cod' ? (item.cod_name || null) : null,
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

    if (services?.other_pickup?.enabled) {
      const o = services.other_pickup;
      // Multi-item form → one service line per entry; fall back to legacy url/notes.
      const entries = (o.items && o.items.length > 0 ? o.items : [{ url: o.url || '', notes: o.notes || '' }])
        .filter(e => (e.url || '').trim() || (e.notes || '').trim());
      entries.forEach((entry, idx) => {
        allOrderItems.push({
          order_id: order.id,
          product_id: 'service-other-pickup',
          description: entries.length > 1
            ? `Other Third-Party Item ${idx + 1} of ${entries.length} (Sinclair's)`
            : 'Other Third-Party Item (Sinclair\'s)',
          category: 'Additional Services',
          pkg_size: null, uom: null, upc: null,
          unit_price: 0, quantity: 1, line_total: 0,
          item_type: 'service',
          service_type: 'other_pickup',
          service_details: {
            url: entry.url || '',
            notes: entry.notes || '',
          },
        });
      });
    }

    if (allOrderItems.length > 0) {
      await supabase.from('order_items').insert(allOrderItems);
    }

    // ── Digital coupons — auto-applied like Sinclair's own site ──
    // Gated on the Sinclair manager's toggle: off = nothing applied. COD
    // lines don't qualify (rung separately at the register). Savings are
    // ESTIMATES until the order is shopped.
    try {
      const { data: couponCfg } = await supabase
        .from('admin_settings')
        .select('show_digital_coupons')
        .single();
      if ((couponCfg?.show_digital_coupons ?? true) && items.length > 0) {
        const deals = await fetchActiveDeals();
        const applied = computeDiscounts(
          items.map(i => ({
            freshop_id: freshopMap[i.product_id] ?? null,
            quantity: i.quantity,
            paid_by: i.paid_by === 'cod' ? 'cod' as const : 'vessel' as const,
          })),
          deals,
        );
        if (applied.length > 0) {
          const discountTotal = Math.round(applied.reduce((s, d) => s + d.amount, 0) * 100) / 100;
          await supabase.from('order_discounts').insert(
            applied.map(d => ({ order_id: order.id, ...d }))
          );
          await supabase.from('orders').update({ discount_total: discountTotal }).eq('id', order.id);
        }
      }
    } catch (err) {
      // Coupon evaluation must never block an order — worst case the savings
      // simply show up on the final invoice like before.
      console.error('Coupon evaluation error:', err);
    }

    const { data: fullOrder } = await supabase
      .from('orders')
      .select('*, items:order_items(*), discounts:order_discounts(*)')
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

  // Sinclair's roles are scoped by definition — see isSinclairScoped().
  const isSinclair = isSinclairScoped(session);

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
