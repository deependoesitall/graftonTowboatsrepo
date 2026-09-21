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
  // Migration 064 — link to the web order that spawned this ledger row.
  // Without this, linking an order in the editor never persisted.
  'order_id',
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

/**
 * When billing Sinclair's groceries and the total is blank, pull the linked
 * order's register_total if it is a real number. Never invent from subtotal —
 * that is an estimate and must stay a deliberate UI action, not a silent fill.
 * Returns { row, autofilledFrom } so the client can show the source.
 */
async function autofillGroceryFromOrder(
  supabase: ReturnType<typeof createServiceClient>,
  row: Record<string, unknown>,
): Promise<{ row: Record<string, unknown>; autofilledFrom: number | null }> {
  // Keep bill_for_groceries in step with grocery_mode when the mode is present.
  if (typeof row.grocery_mode === 'string') {
    const mode = row.grocery_mode;
    if (mode === 'sinclair_courtesy' || mode === 'gts_purchased') {
      row.bill_for_groceries = true;
    } else if (mode === 'none') {
      row.bill_for_groceries = false;
    }
  }

  const wantsGrocery =
    row.bill_for_groceries === true || row.grocery_mode === 'sinclair_courtesy';
  const blank =
    row.sinclairs_grocery_total === null ||
    row.sinclairs_grocery_total === undefined ||
    row.sinclairs_grocery_total === '';
  const orderId = typeof row.order_id === 'string' ? row.order_id : null;
  if (!wantsGrocery || !blank || !orderId) {
    return { row, autofilledFrom: null };
  }

  const { data: order } = await supabase
    .from('orders')
    .select('register_total')
    .eq('id', orderId)
    .maybeSingle();

  const rt = order?.register_total;
  if (rt == null || rt === '') return { row, autofilledFrom: null };
  const n = Number(rt);
  if (!Number.isFinite(n)) return { row, autofilledFrom: null };

  row.sinclairs_grocery_total = n;
  return { row, autofilledFrom: n };
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports' });
  if (session instanceof NextResponse) return session;
  const supabase = createServiceClient();

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month'); // YYYY-MM  (single month)
  const year = searchParams.get('year');   // YYYY     (whole year)
  const pending = searchParams.get('pending'); // '1' → everything not yet in QuickBooks
  const companyIdFilter = searchParams.get('company_id');
  const vesselNameFilter = searchParams.get('vessel_name');

  let query = supabase
    .from('deliveries')
    // requires_signed_receipt drives the "need slip" warning on the QuickBooks
    // pack — without it here, every row looks like it needs a slip or none do.
    .select('*, company:companies(id, name, requires_signed_receipt)')
    .order('delivery_date', { ascending: false, nullsFirst: false });

  // Used by the final-email dialog to default courtesy billing from ledger history.
  // Jen (Sept 2026): courtesy billing is BY BOAT, not by company — prefer vessel_name.
  if (vesselNameFilter && vesselNameFilter.trim()) {
    query = query.ilike('vessel_name', `%${vesselNameFilter.trim()}%`).limit(25);
  } else if (companyIdFilter) {
    query = query.eq('company_id', companyIdFilter).limit(25);
  }

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

  // One-shot backfill: fill blank Sinclair totals from linked order register_total.
  if (body?.action === 'backfill_grocery_totals') {
    const { data: candidates, error: listErr } = await supabase
      .from('deliveries')
      .select('id, order_id, bill_for_groceries, grocery_mode, sinclairs_grocery_total')
      .not('order_id', 'is', null)
      .is('sinclairs_grocery_total', null);
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    let filled = 0;
    const updated: string[] = [];
    for (const d of candidates || []) {
      const wants =
        d.bill_for_groceries === true || d.grocery_mode === 'sinclair_courtesy';
      if (!wants || !d.order_id) continue;
      const { data: order } = await supabase
        .from('orders')
        .select('register_total')
        .eq('id', d.order_id)
        .maybeSingle();
      const n = order?.register_total == null ? NaN : Number(order.register_total);
      if (!Number.isFinite(n)) continue;
      const { error: upErr } = await supabase
        .from('deliveries')
        .update({ sinclairs_grocery_total: n, updated_at: new Date().toISOString() })
        .eq('id', d.id);
      if (!upErr) {
        filled += 1;
        updated.push(d.id);
      }
    }
    return NextResponse.json({ filled, updated });
  }

  const picked = pick(body);
  const { row, autofilledFrom } = await autofillGroceryFromOrder(supabase, picked);
  const { data, error } = await supabase
    .from('deliveries')
    .insert(row)
    .select('*, company:companies(id, name, requires_signed_receipt)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ delivery: data, autofilledFrom });
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports', editRequired: true });
  if (session instanceof NextResponse) return session;
  const { id, ...body } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const supabase = createServiceClient();
  const picked = pick(body);
  const { row, autofilledFrom } = await autofillGroceryFromOrder(supabase, picked);
  const { data, error } = await supabase
    .from('deliveries')
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, company:companies(id, name, requires_signed_receipt)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ delivery: data, autofilledFrom });
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
