// src/app/api/admin/reports/billing/route.ts
// Billing tab data: orders (with items) for a date range, used by Mary for
// end-of-month per-company invoice exports. Owner-only (reports area).
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports' });
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const supabase = createServiceClient();

  // Item-level detail is intentionally rich: Mary Karen cross-references every
  // line against Sinclair's paperwork before sending an invoice. COD lines are
  // included in the payload (flagged via paid_by) but excluded from billing
  // totals/exports client-side — they're settled at delivery, never invoiced.
  let query = supabase
    .from('orders')
    .select('id, order_number, company_name, contact_name, phone, customer_email, po_number, vessel_name, terminal_name, delivery_method, arrival_date, arrival_time, subtotal, discount_total, register_total, delivery_fee, delivery_service_type, delivery_company_id, bill_for_groceries, invoice_number, status, created_at, extended_info, items:order_items(id, description, category, pkg_size, uom, upc, quantity, unit_price, line_total, shopping_status, actual_total, actual_weight, is_substitution, substitutes_item_id, item_type, service_type, service_details, paid_by, cod_name), discounts:order_discounts(id, name, description, amount)')
    .neq('status', 'cancelled')
    .order('company_name', { ascending: true })
    .order('created_at', { ascending: true });

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data || [] });
}
