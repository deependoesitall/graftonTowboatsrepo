// src/app/api/admin/reports/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { TIME_ZONE } from '@/lib/utils';

function csvEscape(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function money(n: unknown): string {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(2) : '';
}

function chicagoDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

function chicagoTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

type ExportItem = {
  description?: string;
  category?: string;
  quantity?: number;
  unit_price?: number;
  line_total?: number;
  paid_by?: string | null;
  item_type?: string | null;
};

function paidOf(i: ExportItem): string {
  return i.paid_by || 'vessel';
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports' });
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const type = searchParams.get('type') || 'orders'; // orders | products | vessels

  const supabase = createServiceClient();

  const SELECT_FULL =
    'id, order_number, company_name, vessel_name, contact_name, phone, customer_email, vessel_email, po_number, terminal_name, delivery_method, arrival_date, arrival_time, crew_change, notes, eta, subtotal, discount_total, register_total, deck_register_total, delivery_fee, delivery_service_type, bill_for_groceries, invoice_number, status, source, purchased_at, created_at, items:order_items(description, category, quantity, unit_price, line_total, paid_by, item_type)';
  const SELECT_CORE =
    'id, order_number, company_name, vessel_name, contact_name, phone, customer_email, vessel_email, po_number, terminal_name, delivery_method, arrival_date, arrival_time, crew_change, notes, eta, subtotal, discount_total, register_total, deck_register_total, delivery_fee, delivery_service_type, bill_for_groceries, invoice_number, status, created_at, items:order_items(description, category, quantity, unit_price, line_total, paid_by, item_type)';

  type OrderExportRow = {
    order_number: string;
    company_name: string;
    vessel_name: string | null;
    contact_name: string;
    phone: string;
    customer_email: string | null;
    vessel_email: string | null;
    po_number: string | null;
    terminal_name: string | null;
    delivery_method: string | null;
    arrival_date: string | null;
    arrival_time: string | null;
    crew_change: string | null;
    notes: string | null;
    eta: string | null;
    subtotal: number;
    discount_total: number | null;
    register_total: number | null;
    deck_register_total: number | null;
    delivery_fee: number | null;
    delivery_service_type: string | null;
    bill_for_groceries: boolean | null;
    invoice_number: number | null;
    status: string;
    source?: string | null;
    purchased_at?: string | null;
    created_at: string;
    items: ExportItem[] | null;
  };

  let query = supabase.from('orders').select(SELECT_FULL).order('created_at', { ascending: true });
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const first = await query;
  let data: OrderExportRow[] | null = (first.data || null) as OrderExportRow[] | null;
  let error = first.error;
  if (error) {
    let fallback = supabase.from('orders').select(SELECT_CORE).order('created_at', { ascending: true });
    if (from) fallback = fallback.gte('created_at', from);
    if (to) fallback = fallback.lte('created_at', to);
    const retry = await fallback;
    data = (retry.data || null) as OrderExportRow[] | null;
    error = retry.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const orders = data || [];

  let csv = '';
  let filename = 'report.csv';

  if (type === 'orders') {
    filename = `orders_${from || 'all'}_${to || 'all'}.csv`;
    csv = [
      'Order Number',
      'Date',
      'Time',
      'Status',
      'Company',
      'Vessel',
      'Contact',
      'Phone',
      'Billing Email',
      'Boat Email',
      'PO',
      'Terminal',
      'Delivery Method',
      'Arrival Date',
      'Arrival Time',
      'Crew Change',
      'Item Count',
      'Grocery Estimate',
      'COD Estimate',
      'Deck Estimate',
      'Discount',
      'Order Estimate',
      'Register Total',
      'Deck Register Total',
      'Delivery Fee',
      'Delivery Type',
      'Bill Groceries',
      'Invoice #',
      'Source',
      'Notes',
    ].join(',') + '\n';
    for (const o of orders) {
      const items = o.items || [];
      const grocery = items.filter(i => i.item_type !== 'service' && paidOf(i) === 'vessel');
      const cod = items.filter(i => paidOf(i) === 'cod');
      const deck = items.filter(i => paidOf(i) === 'deck');
      const itemCount = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      const sum = (rows: ExportItem[]) => rows.reduce((s, i) => s + Number(i.line_total || 0), 0);
      csv += [
        o.order_number,
        chicagoDate(o.created_at),
        chicagoTime(o.created_at),
        o.status,
        o.company_name,
        o.vessel_name || '',
        o.contact_name,
        o.phone,
        o.customer_email || '',
        o.vessel_email || '',
        o.po_number || '',
        o.terminal_name || '',
        o.delivery_method || '',
        o.arrival_date || '',
        o.arrival_time || '',
        o.crew_change || '',
        itemCount,
        money(sum(grocery)),
        money(sum(cod)),
        money(sum(deck)),
        money(o.discount_total),
        money(o.subtotal),
        o.register_total != null ? money(o.register_total) : '',
        o.deck_register_total != null ? money(o.deck_register_total) : '',
        o.delivery_fee != null ? money(o.delivery_fee) : '',
        o.delivery_service_type || '',
        o.bill_for_groceries === false ? 'No' : 'Yes',
        o.invoice_number ?? '',
        o.source || '',
        o.notes || '',
      ].map(csvEscape).join(',') + '\n';
    }
  } else if (type === 'products') {
    filename = `top_products_${from || 'all'}_${to || 'all'}.csv`;
    const productMap = new Map<string, { description: string; category: string; qty: number; revenue: number }>();
    for (const o of orders) {
      for (const item of o.items) {
        const cur = productMap.get(item.description) || { description: item.description, category: item.category, qty: 0, revenue: 0 };
        cur.qty += item.quantity;
        cur.revenue += Number(item.line_total);
        productMap.set(item.description, cur);
      }
    }
    const totalRevenue = Array.from(productMap.values()).reduce((s, p) => s + p.revenue, 0);
    const sorted = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);
    csv = 'Rank,Product,Category,Qty Sold,Revenue,% of Total\n';
    sorted.forEach((p, i) => {
      const pct = totalRevenue > 0 ? ((p.revenue / totalRevenue) * 100).toFixed(1) : '0.0';
      csv += [i + 1, p.description, p.category, p.qty, p.revenue.toFixed(2), `${pct}%`].map(csvEscape).join(',') + '\n';
    });
  } else if (type === 'vessels') {
    filename = `vessels_${from || 'all'}_${to || 'all'}.csv`;
    const vesselMap = new Map<string, { company_name: string; contact_name: string; phone: string; orderCount: number; totalSpent: number }>();
    for (const o of orders) {
      const key = `${o.company_name.toLowerCase()}|${o.phone}`;
      const cur = vesselMap.get(key) || { company_name: o.company_name, contact_name: o.contact_name, phone: o.phone, orderCount: 0, totalSpent: 0 };
      cur.orderCount += 1;
      cur.totalSpent += Number(o.subtotal);
      vesselMap.set(key, cur);
    }
    csv = 'Company / Vessel,Contact,Phone,Orders,Total Spent,Avg Order Value\n';
    Array.from(vesselMap.values()).sort((a, b) => b.totalSpent - a.totalSpent).forEach(v => {
      csv += [v.company_name, v.contact_name, v.phone, v.orderCount, v.totalSpent.toFixed(2), (v.totalSpent / v.orderCount).toFixed(2)]
        .map(csvEscape).join(',') + '\n';
    });
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
