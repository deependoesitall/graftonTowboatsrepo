// src/app/api/admin/reports/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

function auth(req: NextRequest) {
  return req.headers.get('x-admin-token') === process.env.ADMIN_SECRET_KEY;
}

const fmt = (n: number) => `$${n.toFixed(2)}`;

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const label = searchParams.get('label') || 'Custom Range';

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

  const totalRevenue = orders.reduce((s, o) => s + Number(o.subtotal), 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalItems = orders.reduce((s, o) => s + o.items.reduce((si: number, i: any) => si + i.quantity, 0), 0);

  const productMap = new Map<string, { description: string; category: string; qty: number; revenue: number }>();
  for (const o of orders) {
    for (const item of o.items) {
      const cur = productMap.get(item.description) || { description: item.description, category: item.category, qty: 0, revenue: 0 };
      cur.qty += item.quantity;
      cur.revenue += Number(item.line_total);
      productMap.set(item.description, cur);
    }
  }
  const topProducts = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 15);

  const vesselMap = new Map<string, { company_name: string; orderCount: number; totalSpent: number }>();
  for (const o of orders) {
    const key = `${o.company_name.toLowerCase()}|${o.phone}`;
    const cur = vesselMap.get(key) || { company_name: o.company_name, orderCount: 0, totalSpent: 0 };
    cur.orderCount += 1;
    cur.totalSpent += Number(o.subtotal);
    vesselMap.set(key, cur);
  }
  const topVessels = Array.from(vesselMap.values()).sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);

  const productRows = topProducts.map((p, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8f9fa'};">
      <td style="padding:6px 10px;font-size:11px;text-align:center;">${i + 1}</td>
      <td style="padding:6px 10px;font-size:11px;font-weight:600;">${p.description}</td>
      <td style="padding:6px 10px;font-size:11px;color:#666;">${p.category}</td>
      <td style="padding:6px 10px;font-size:11px;text-align:center;">${p.qty}</td>
      <td style="padding:6px 10px;font-size:11px;text-align:right;font-weight:700;">${fmt(p.revenue)}</td>
    </tr>`).join('');

  const vesselRows = topVessels.map((v, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8f9fa'};">
      <td style="padding:6px 10px;font-size:11px;text-align:center;">${i + 1}</td>
      <td style="padding:6px 10px;font-size:11px;font-weight:600;">${v.company_name}</td>
      <td style="padding:6px 10px;font-size:11px;text-align:center;">${v.orderCount}</td>
      <td style="padding:6px 10px;font-size:11px;text-align:right;font-weight:700;">${fmt(v.totalSpent)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>GTS Report — ${label}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size:12px; color:#222; }
@page { size: letter; margin: 0.5in; }
@media print { .no-print { display:none !important; } }
.print-btn { position:fixed; top:16px; right:16px; background:#1E3D1E; color:#D9E84A; border:none;
  padding:10px 22px; border-radius:24px; font-size:13px; font-weight:800; cursor:pointer;
  text-transform:uppercase; letter-spacing:1px; box-shadow:0 4px 12px rgba(0,0,0,0.2); }
.section-title { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1px;
  color:#1E3D1E; margin:18px 0 6px; border-bottom:1px solid #ddd; padding-bottom:3px; }
table { width:100%; border-collapse:collapse; }
thead th { padding:8px 10px; text-align:left; background:#1E3D1E; color:#D9E84A; font-size:10px;
  text-transform:uppercase; letter-spacing:0.5px; }
.stat-box { display:inline-block; width:24%; padding:10px; background:#f0f7a0; border-radius:4px; margin-right:1%; text-align:center; }
.stat-label { font-size:9px; color:#666; text-transform:uppercase; letter-spacing:1px; }
.stat-value { font-size:18px; font-weight:900; color:#1E3D1E; margin-top:4px; }
</style></head>
<body>
<button class="print-btn no-print" onclick="window.print()">⬇ Save as PDF</button>

<div style="border-bottom:4px solid #1E3D1E; padding-bottom:12px; margin-bottom:16px;">
  <div style="font-size:20px; font-weight:900; color:#1E3D1E; text-transform:uppercase;">Grafton Towboat Services</div>
  <div style="font-size:11px; color:#E8640A; font-weight:700;">BUSINESS REPORT — ${label}</div>
  <div style="font-size:10px; color:#666; margin-top:4px;">
    ${from ? new Date(from).toLocaleDateString() : 'All time'} – ${to ? new Date(to).toLocaleDateString() : 'Present'}
    · Generated ${new Date().toLocaleDateString()}
  </div>
</div>

<div>
  <div class="stat-box"><div class="stat-label">Total Revenue</div><div class="stat-value">${fmt(totalRevenue)}</div></div>
  <div class="stat-box"><div class="stat-label">Total Orders</div><div class="stat-value">${totalOrders}</div></div>
  <div class="stat-box"><div class="stat-label">Avg Order Value</div><div class="stat-value">${fmt(avgOrderValue)}</div></div>
  <div class="stat-box"><div class="stat-label">Items Sold</div><div class="stat-value">${totalItems}</div></div>
</div>

<div class="section-title">Top Products by Revenue</div>
<table>
  <thead><tr><th style="width:6%;text-align:center;">#</th><th style="width:42%;">Product</th><th style="width:22%;">Category</th><th style="width:12%;text-align:center;">Qty</th><th style="width:18%;text-align:right;">Revenue</th></tr></thead>
  <tbody>${productRows || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#999;">No data for this period</td></tr>'}</tbody>
</table>

<div class="section-title">Top Customers / Vessels by Spend</div>
<table>
  <thead><tr><th style="width:6%;text-align:center;">#</th><th style="width:50%;">Company / Vessel</th><th style="width:22%;text-align:center;">Orders</th><th style="width:22%;text-align:right;">Total Spent</th></tr></thead>
  <tbody>${vesselRows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#999;">No data for this period</td></tr>'}</tbody>
</table>

<div style="margin-top:24px; text-align:center; font-size:9px; color:#999; border-top:1px solid #eee; padding-top:10px;">
  Grafton Towboat Services · 25 Dagget Hollow, Grafton, IL 62037 · (618) 556-0290
</div>

</body></html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
