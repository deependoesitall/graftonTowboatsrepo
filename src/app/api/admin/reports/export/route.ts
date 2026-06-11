// src/app/api/admin/reports/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';


function csvEscape(val: any): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports' });
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const type = searchParams.get('type') || 'orders'; // orders | products | vessels

  const supabase = createServiceClient();

  let query = supabase
    .from('orders')
    .select('id, order_number, company_name, contact_name, phone, subtotal, status, created_at, items:order_items(description, category, quantity, unit_price, line_total)')
    .order('created_at', { ascending: true });

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const orders = (data || []) as any[];

  let csv = '';
  let filename = 'report.csv';

  if (type === 'orders') {
    filename = `orders_${from || 'all'}_${to || 'all'}.csv`;
    csv = 'Order Number,Vessel,Contact,Phone,Date,Status,Items,Total\n';
    for (const o of orders) {
      const itemCount = o.items.reduce((s: number, i: any) => s + i.quantity, 0);
      csv += [
        o.order_number, o.company_name, o.contact_name, o.phone,
        new Date(o.created_at).toLocaleDateString(), o.status, itemCount, o.subtotal,
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
