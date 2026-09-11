// src/app/api/admin/vessel-orders/route.ts
//
// What this boat ordered last time, and the time before that.
//
// ── WHY STAFF NEED THIS AND CUSTOMERS ALREADY HAD IT ─────────────────────
//
// A captain signed in on the storefront can hit Reorder. The people taking the
// order by phone — which is still most of them — had nothing: a boat that sends
// the same forty lines every fortnight was retyped from scratch every fortnight.
// The history was sitting in the database the whole time, addressed by account
// rather than by vessel, which is the one key staff actually have.
//
// So this looks orders up BY BOAT, not by account. It deliberately crosses
// account boundaries: the Scott Noble's cook may have ordered under his own
// login, the port captain under another, and a dozen more may have been typed
// in here by Jen with no account at all. To the person rebuilding the order
// they are all "what this boat orders", and splitting them by whoever happened
// to submit them would hide most of the answer.
//
// ⚠️ STAFF ONLY. Scoped by requireAdmin and nothing else — there is no vessel
// token, so anyone reaching this endpoint could read any boat's order history.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';

/** ⚠️ ONE STRING LITERAL — supabase-js parses this as a type. */
const ORDER_COLUMNS =
  'id, order_number, created_at, status, subtotal, vessel_name, company_name, terminal_name, arrival_date, delivery_method';

export interface PastOrderLine {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  paid_by: string | null;
  cod_name: string | null;
  item_type: string | null;
}

export interface PastOrder {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  subtotal: number;
  terminal_name: string | null;
  arrival_date: string | null;
  delivery_method: string | null;
  lines: PastOrderLine[];
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const vessel = (req.nextUrl.searchParams.get('vessel') || '').trim();
  if (vessel.length < 2) return NextResponse.json({ orders: [] });
  const company = (req.nextUrl.searchParams.get('company') || '').trim();

  const supabase = createServiceClient();

  // Exact name match, case-insensitive. NOT a fuzzy search: "Scott Noble" must
  // never quietly return the "W. Scott Noble II"'s groceries, because the whole
  // point is to load them onto an order.
  let q = supabase
    .from('orders')
    .select(ORDER_COLUMNS)
    .ilike('vessel_name', vessel)
    .order('created_at', { ascending: false })
    .limit(10);
  // Company narrows it only when we have one — two lines can run boats with the
  // same name, and an order typed from a paper form may have left it blank.
  if (company) q = q.ilike('company_name', company);

  const { data: orders, error } = await q;
  if (error) {
    console.error('vessel-orders error:', error);
    return NextResponse.json({ orders: [] });
  }
  const rows = (orders ?? []) as unknown as Array<{
    id: string; order_number: string; created_at: string; status: string;
    subtotal: number; terminal_name: string | null; arrival_date: string | null;
    delivery_method: string | null;
  }>;
  if (!rows.length) return NextResponse.json({ orders: [] });

  // One query for every line rather than one per order.
  const { data: items } = await supabase
    .from('order_items')
    .select('order_id, product_id, description, quantity, unit_price, paid_by, cod_name, item_type')
    .in('order_id', rows.map(r => r.id));

  const byOrder = new Map<string, PastOrderLine[]>();
  for (const it of (items ?? []) as unknown as Array<PastOrderLine & { order_id: string }>) {
    // Service lines — crew change, a parts pickup — are jobs, not groceries.
    // Carrying them into a new order would re-book the work.
    if (it.item_type === 'service') continue;
    const list = byOrder.get(it.order_id) || [];
    list.push({
      product_id: it.product_id,
      description: it.description,
      quantity: Number(it.quantity) || 0,
      unit_price: Number(it.unit_price) || 0,
      paid_by: it.paid_by,
      cod_name: it.cod_name,
      item_type: it.item_type,
    });
    byOrder.set(it.order_id, list);
  }

  const out: PastOrder[] = rows.map(r => ({
    id: r.id,
    order_number: r.order_number,
    created_at: r.created_at,
    status: r.status,
    subtotal: Number(r.subtotal) || 0,
    terminal_name: r.terminal_name,
    arrival_date: r.arrival_date,
    delivery_method: r.delivery_method,
    lines: byOrder.get(r.id) || [],
  })).filter(o => o.lines.length > 0);

  return NextResponse.json({ orders: out });
}
