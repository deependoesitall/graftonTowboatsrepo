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

  let query = supabase
    .from('orders')
    .select('id, order_number, company_name, contact_name, phone, customer_email, po_number, vessel_name, subtotal, status, created_at, extended_info, items:order_items(id, description, quantity, unit_price, line_total, shopping_status, actual_total, actual_weight, is_substitution, substitutes_item_id, item_type, service_type)')
    .neq('status', 'cancelled')
    .order('company_name', { ascending: true })
    .order('created_at', { ascending: true });

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data || [] });
}
