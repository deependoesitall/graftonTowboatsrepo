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
  // Migration 072. THIS LIST IS A SILENT FILTER — anything missing from it is
  // dropped by pick() with no error, so the form saves "successfully" and the
  // data never lands. Add the column here in the same commit as the migration.
  'po_number', 'helper_name', 'helper_hours', 'helper_pay',
  // Migration 074 — the QuickBooks handoff.
  // grocery_mode decides whether QBO taxes the grocery line, so a silent drop
  // here would be a tax error, not a cosmetic one.
  'grocery_mode', 'side_purchases',
  'customer_invoiced_in_qb', 'driver_paid_in_qb',
  'not_billable', 'not_billable_reason',
];

/** Columns that are NOT NULL in the database — blank must not become null. */
const NOT_NULL_DEFAULTS: Record<string, unknown> = {
  grocery_mode: 'none',
  side_purchases: [],
  customer_invoiced_in_qb: false,
  driver_paid_in_qb: false,
  not_billable: false,
};

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    // Empty string means "cleared" for the free-text columns, which is a real
    // null. But migration 074 added NOT NULL columns, and sending null to one
    // of those is a 500 the form would surface as "Could not save this
    // delivery" with no clue why. Fall back to the column's own default.
    if (v === '' || v === null || v === undefined) {
      out[f] = f in NOT_NULL_DEFAULTS ? NOT_NULL_DEFAULTS[f] : null;
    } else {
      out[f] = v;
    }
  }
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
    // requires_signed_receipt drives the "need slip" warning on the QuickBooks
    // pack — without it here, every row looks like it needs a slip or none do.
    .select('*, company:companies(id, name, requires_signed_receipt)')
    .order('delivery_date', { ascending: false, nullsFirst: false });

  // The QuickBooks queue is deliberately NOT month-scoped: if Mary Karen is a
  // week behind at a month boundary, last month's unentered deliveries must
  // still show up or they'd silently drop out of view and never get billed.
  if (pending === '1') {
    // NULL means "never marked", same as false — and the imported 2026 history
    // has NULLs. `eq(false)` alone silently skips them in Postgres, which made
    // the badge count rows the queue then refused to show.
    const { data, error } = await query.or('updated_quickbooks.is.null,updated_quickbooks.eq.false');
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
    // requires_signed_receipt drives the "need slip" warning on the QuickBooks
    // pack — without it here, every row looks like it needs a slip or none do.
    .select('*, company:companies(id, name, requires_signed_receipt)')
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
    // requires_signed_receipt drives the "need slip" warning on the QuickBooks
    // pack — without it here, every row looks like it needs a slip or none do.
    .select('*, company:companies(id, name, requires_signed_receipt)')
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
