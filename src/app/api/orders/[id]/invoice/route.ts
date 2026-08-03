// src/app/api/orders/[id]/invoice/route.ts
// Generates the GTS invoice (the "Invoice 1083" document) for an order:
// the delivery fee and — when GTS bills groceries — Sinclair's grocery total,
// as line items with a grand total, billed to the barge line. Returns
// printable HTML (iframe-friendly), same as the receipt/pick-sheet endpoints.
// Owner-only (billing).

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { formatCurrency } from '@/lib/utils';

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const supabase = createServiceClient();
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  // Assign a sequential GTS invoice number the first time this order's invoice
  // is generated, then reuse it forever (stored on the order).
  let invoiceNumber: number | null = order.invoice_number ?? null;
  if (!invoiceNumber) {
    const { data: n } = await supabase.rpc('next_invoice_number');
    if (n != null) {
      invoiceNumber = Number(n);
      await supabase.from('orders').update({ invoice_number: invoiceNumber }).eq('id', id);
    }
  }

  // Bill-to prefers the chosen barge line; falls back to the order's company.
  let companyName: string | null = null;
  if (order.delivery_company_id) {
    const { data: c } = await supabase.from('companies').select('name').eq('id', order.delivery_company_id).single();
    companyName = c?.name || null;
  }
  const billTo = companyName || order.company_name || order.vessel_name || 'Customer';
  const dateStr = new Date(order.arrival_date || order.created_at).toLocaleDateString('en-US');
  const due = new Date(order.arrival_date || order.created_at);
  due.setDate(due.getDate() + 30);
  const dueStr = due.toLocaleDateString('en-US');

  const deliveryFee = Number(order.delivery_fee) || 0;
  const billGroceries = order.bill_for_groceries !== false;
  const groceryTotal = order.register_total != null ? Number(order.register_total) : Number(order.subtotal);
  const desc = `${dateStr} · ${esc(order.vessel_name || order.company_name || '')}`;

  const lines: Array<{ svc: string; desc: string; amount: number }> = [];
  if (deliveryFee > 0) lines.push({ svc: order.delivery_service_type || 'Delivery', desc: `${desc} delivery`, amount: deliveryFee });
  if (billGroceries) lines.push({ svc: "Sinclair's", desc: `${desc} grocery order`, amount: groceryTotal });
  const total = lines.reduce((s, l) => s + l.amount, 0);

  const rows = lines.map((l, i) => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;">${i + 1}.</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;font-weight:600;">${esc(l.svc)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#555;">${esc(l.desc)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;">1</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(l.amount)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:700;">${formatCurrency(l.amount)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Invoice — ${esc(order.order_number)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;} body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:32px;font-size:13px;}
  @media print{ .toolbar{display:none;} body{padding:0;} }
  .toolbar{position:sticky;top:0;display:flex;justify-content:flex-end;margin-bottom:16px;}
  .toolbar button{background:#1E3D1E;color:#D9E84A;border:0;padding:8px 20px;border-radius:6px;font-weight:bold;cursor:pointer;}
  h1{font-size:26px;letter-spacing:2px;color:#1E3D1E;} .muted{color:#777;font-size:12px;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1E3D1E;padding-bottom:14px;margin-bottom:18px;}
  .grid{display:flex;gap:40px;margin-bottom:22px;} .grid h4{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:4px;}
  table{width:100%;border-collapse:collapse;margin-bottom:6px;} thead th{background:#1E3D1E;color:#D9E84A;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:8px;text-align:left;}
  thead th.r{text-align:right;} thead th.c{text-align:center;}
  .total{display:flex;justify-content:flex-end;margin-top:8px;} .total .box{min-width:240px;}
  .total .row{display:flex;justify-content:space-between;padding:6px 8px;} .total .grand{background:#D9E84A;font-weight:900;font-size:16px;color:#1E3D1E;border-radius:4px;}
  .note{margin-top:22px;font-size:11px;color:#777;border-top:1px solid #eee;padding-top:12px;}
</style></head><body>
  <div class="toolbar"><button onclick="window.print()">🖨 Print / Save PDF</button></div>
  <div class="head">
    <div>
      <h1>INVOICE</h1>
      <div class="muted" style="margin-top:6px;">
        <strong>Grafton Towboat Services LLC</strong><br/>
        25 Dagget Holw, Grafton, IL 62037-1196<br/>
        (314) 809-0853 · GraftonTowboatServices@gmail.com
      </div>
    </div>
    <div style="text-align:right;" class="muted">
      <div><strong style="color:#1E3D1E;font-size:14px;">Invoice No. ${invoiceNumber ?? esc(order.order_number)}</strong></div>
      <div>Order ref: ${esc(order.order_number)}</div>
      <div>Invoice date: ${dateStr}</div>
      <div>Terms: Net 30 · Due ${dueStr}</div>
    </div>
  </div>

  <div class="grid">
    <div><h4>Bill To</h4><div><strong>${esc(billTo)}</strong>${order.vessel_name ? `<br/>Vessel: ${esc(order.vessel_name)}` : ''}${order.po_number ? `<br/>PO #: ${esc(order.po_number)}` : ''}</div></div>
    <div><h4>Delivery</h4><div>${esc(dateStr)}${order.terminal_name ? `<br/>${esc(order.terminal_name)}` : ''}</div></div>
  </div>

  <table>
    <thead><tr><th>#</th><th>Product or service</th><th>Description</th><th class="c">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6" style="padding:14px;color:#999;">No billable delivery fee set on this order yet.</td></tr>`}</tbody>
  </table>

  <div class="total"><div class="box">
    ${lines.map(l => `<div class="row"><span>${esc(l.svc)}</span><span>${formatCurrency(l.amount)}</span></div>`).join('')}
    <div class="row grand"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>
  </div></div>

  ${!billGroceries ? `<p class="note">Groceries are billed to the customer directly by Sinclair&apos;s Foods. This invoice covers Grafton Towboat Services delivery only.</p>`
    : `<p class="note">Groceries reflect Sinclair&apos;s register total. Grafton Towboat Services delivery is billed separately from Sinclair&apos;s and shown above as one combined total.</p>`}
</body></html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
