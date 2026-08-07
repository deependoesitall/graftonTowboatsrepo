// src/app/api/admin/deliveries/route.ts
// The delivery ledger — the "2025_2026 DELIVERIES" spreadsheet, in-app.
// GET    — ?month=YYYY-MM (default current) → rows for that month, newest first
// POST   — add a delivery
// PATCH  — edit a delivery
// DELETE — remove a delivery

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

const FIELDS = [
  'delivery_date', 'delivery_driver', 'hours_worked', 'amount_paid_driver',
  'vessel_name', 'company_id', 'service_type', 'location_delivered',
  'delivery_fee', 'bill_for_groceries', 'sinclairs_grocery_total',
  'updated_quickbooks', 'phone_number_used', 'ingram_slip_image_url',
  'issues_comments', 'gts_correspondent', 'invoice_sent', 'incentive',
];

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) if (f in body) out[f] = body[f] === '' ? null : body[f];
  return out;
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports' });
  if (session instanceof NextResponse) return session;
  const supabase = createServiceClient();

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month'); // YYYY-MM  (single month)
  const year = searchParams.get('year');   // YYYY     (whole year)
  const pending = searchParams.get('pending'); // '1' → everything not yet in QuickBooks

  let query = supabase
    .from('deliveries')
    .select('*, company:companies(id, name)')
    .order('delivery_date', { ascending: false, nullsFirst: false });

  // The QuickBooks queue is deliberately NOT month-scoped: if Mary Karen is a
  // week behind at a month boundary, last month's unentered deliveries must
  // still show up or they'd silently drop out of view and never get billed.
  if (pending === '1') {
    const { data, error } = await query.eq('updated_quickbooks', false);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deliveries: data || [] });
  }

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    query = query.gte('delivery_date', start).lt('delivery_date', next);
  } else if (year && /^\d{4}$/.test(year)) {
    query = query.gte('delivery_date', `${year}-01-01`).lt('delivery_date', `${Number(year) + 1}-01-01`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Month totals for the header summary
  const rows = data || [];
  const totals = {
    count: rows.length,
    delivery_fees: rows.reduce((s, r) => s + Number(r.delivery_fee || 0), 0),
    groceries: rows.reduce((s, r) => s + Number(r.sinclairs_grocery_total || 0), 0),
    driver_pay: rows.reduce((s, r) => s + Number(r.amount_paid_driver || 0), 0),
  };
  return NextResponse.json({ deliveries: rows, totals });
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports', editRequired: true });
  if (session instanceof NextResponse) return session;
  const body = await req.json();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('deliveries')
    .insert(pick(body))
    .select('*, company:companies(id, name)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ delivery: data });
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports', editRequired: true });
  if (session instanceof NextResponse) return session;
  const { id, ...body } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('deliveries')
    .update({ ...pick(body), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, company:companies(id, name)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ delivery: data });
}

export async function DELETE(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports', editRequired: true });
  if (session instanceof NextResponse) return session;
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const supabase = createServiceClient();
  const { error } = await supabase.from('deliveries').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
