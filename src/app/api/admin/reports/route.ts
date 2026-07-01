// src/app/api/admin/reports/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';


interface OrderRow {
  id: string;
  order_number: string;
  company_name: string;
  contact_name: string;
  phone: string;
  customer_email: string | null;
  vessel_name: string | null;
  vessel_type: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  notes: string | null;
  eta: string | null;
  subtotal: number;
  status: string;
  created_at: string;
  items: Array<{
    product_id: string | null;
    description: string;
    category: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    item_type: string | null;
  }>;
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports' });
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from'); // ISO date string
  const to = searchParams.get('to');     // ISO date string

  const supabase = createServiceClient();

  let query = supabase
    .from('orders')
    .select('id, order_number, company_name, contact_name, phone, customer_email, vessel_name, vessel_type, arrival_date, arrival_time, notes, eta, subtotal, status, created_at, items:order_items(product_id, description, category, quantity, unit_price, line_total, item_type)')
    .order('created_at', { ascending: true });

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orders = (data || []) as unknown as OrderRow[];

  // ── Stats cards ──
  const totalRevenue = orders.reduce((s, o) => s + Number(o.subtotal), 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalItemsSold = orders.reduce(
    (s, o) => s + o.items.reduce((si, i) => si + i.quantity, 0), 0
  );

  // ── Revenue trend (group by day) ──
  const trendMap = new Map<string, { revenue: number; orders: number }>();
  for (const o of orders) {
    const day = o.created_at.slice(0, 10); // YYYY-MM-DD
    const cur = trendMap.get(day) || { revenue: 0, orders: 0 };
    cur.revenue += Number(o.subtotal);
    cur.orders += 1;
    trendMap.set(day, cur);
  }
  const revenueTrend = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, revenue: Math.round(v.revenue * 100) / 100, orders: v.orders }));

  // ── Top products ──
  const productMap = new Map<string, { description: string; category: string; qty: number; revenue: number }>();
  for (const o of orders) {
    for (const item of o.items) {
      const key = item.description;
      const cur = productMap.get(key) || { description: item.description, category: item.category, qty: 0, revenue: 0 };
      cur.qty += item.quantity;
      cur.revenue += Number(item.line_total);
      productMap.set(key, cur);
    }
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((p, i) => ({
      rank: i + 1,
      description: p.description,
      category: p.category,
      qty: p.qty,
      revenue: Math.round(p.revenue * 100) / 100,
      pct: totalRevenue > 0 ? Math.round((p.revenue / totalRevenue) * 1000) / 10 : 0,
    }));

  // ── Revenue by category ──
  const categoryMap = new Map<string, number>();
  for (const o of orders) {
    for (const item of o.items) {
      categoryMap.set(item.category, (categoryMap.get(item.category) || 0) + Number(item.line_total));
    }
  }
  const revenueByCategory = Array.from(categoryMap.entries())
    .map(([category, revenue]) => ({
      category,
      revenue: Math.round(revenue * 100) / 100,
      pct: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Vessels / customers ──
  const vesselMap = new Map<string, {
    company_name: string; contact_name: string; phone: string;
    orderCount: number; totalSpent: number; orders: OrderRow[];
    itemCounts: Map<string, number>;
  }>();
  for (const o of orders) {
    const key = `${o.company_name.toLowerCase()}|${o.phone}`;
    const cur = vesselMap.get(key) || {
      company_name: o.company_name, contact_name: o.contact_name, phone: o.phone,
      orderCount: 0, totalSpent: 0, orders: [], itemCounts: new Map<string, number>(),
    };
    cur.orderCount += 1;
    cur.totalSpent += Number(o.subtotal);
    cur.orders.push(o);
    for (const item of o.items) {
      cur.itemCounts.set(item.description, (cur.itemCounts.get(item.description) || 0) + item.quantity);
    }
    vesselMap.set(key, cur);
  }
  const vessels = Array.from(vesselMap.values()).map(v => ({
    company_name: v.company_name,
    contact_name: v.contact_name,
    phone: v.phone,
    orderCount: v.orderCount,
    totalSpent: Math.round(v.totalSpent * 100) / 100,
    avgOrderValue: Math.round((v.totalSpent / v.orderCount) * 100) / 100,
    mostOrdered: Array.from(v.itemCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([description, qty]) => ({ description, qty })),
    orders: v.orders.map(o => ({
      id: o.id, order_number: o.order_number, subtotal: o.subtotal,
      status: o.status, created_at: o.created_at,
      items: o.items,
    })).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  })).sort((a, b) => b.totalSpent - a.totalSpent);

  // ── Repeat customer rate ──
  const repeatVessels = vessels.filter(v => v.orderCount > 1).length;
  const repeatCustomerRate = vessels.length > 0
    ? Math.round((repeatVessels / vessels.length) * 1000) / 10
    : 0;

  // ── Average order size (items per order) ──
  const avgOrderSize = totalOrders > 0
    ? Math.round((totalItemsSold / totalOrders) * 10) / 10
    : 0;

  return NextResponse.json({
    stats: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      totalItemsSold,
      repeatCustomerRate,
      avgOrderSize,
    },
    revenueTrend,
    topProducts,
    revenueByCategory,
    vessels,
  });
}
