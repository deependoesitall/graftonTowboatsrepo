// src/app/api/admin/order-drafts/route.ts
//
// Drafted Orders — the list, and creating one.
//
// ⚠️ A DRAFT IS NOT AN ORDER. Nothing in this file writes to `orders`, sends an
// email, fires a push, or puts anything in a queue. It parks the builder's
// state so the next person to sit down can carry on. The only way an order
// comes into existence is still POST /api/orders, and keeping that true is
// what stops a half-finished draft from ever being shopped or invoiced.
//
// See migration 090.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';

/** Columns the list needs. `state` is deliberately not among them — a draft of
 *  a 200-line order is a large blob and the list never looks inside it. */
const LIST_COLS =
  'id, company_name, vessel_name, line_count, subtotal, created_by, updated_by, created_at, updated_at, status, order_id, placed_at';

const LIST_LIMIT = 60;

export async function GET(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();
  const vessel = (req.nextUrl.searchParams.get('vessel') || '').trim();

  let q = supabase
    .from('order_drafts')
    .select(LIST_COLS)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(LIST_LIMIT);

  if (vessel) q = q.eq('vessel_name', vessel);

  const { data, error } = await q;
  if (error) {
    // A database without 090 has no table. That is not a broken page — it is a
    // migration not yet run — so the builder gets an empty list and a reason,
    // and carries on working exactly as it did before drafts existed.
    console.warn('[order-drafts] list failed:', error.message);
    return NextResponse.json({ drafts: [], unavailable: true, reason: error.message });
  }

  return NextResponse.json({ drafts: data || [] });
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const who = session.display_name || session.username || 'Staff';

  const row = {
    company_name: String(body.company_name || '').slice(0, 200),
    vessel_name: String(body.vessel_name || '').slice(0, 200),
    line_count: Number(body.line_count) || 0,
    subtotal: Number(body.subtotal) || 0,
    state: body.state && typeof body.state === 'object' ? body.state : {},
    created_by: who,
    updated_by: who,
  };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('order_drafts')
    .insert(row)
    .select('id, updated_at')
    .single();

  if (error) {
    console.warn('[order-drafts] create failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ draft: data });
}
