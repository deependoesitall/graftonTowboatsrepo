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
    .select('*, items:order_items(*)')
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
  // Company-billed groceries ONLY — orders.subtotal includes COD lines, which
  // crew members settle personally and must never appear on a company invoice.
  const items = (order.items || []) as Array<{
    item_type?: string; paid_by?: string; shopping_status?: string;
    line_total: number; actual_total: number | null;
  }>;
  const billableGroceryTotal = items
    .filter(i => i.item_type !== 'service' && i.paid_by !== 'cod' && i.shopping_status !== 'out_of_stock')
    .reduce((s, i) => s + Number(i.actual_total ?? i.line_total), 0);
  const groceryTotal = order.register_total != null ? Number(order.register_total) : billableGroceryTotal;
  const desc = `${dateStr} · ${esc(order.vessel_name || order.company_name || '')}`;

  const lines: Array<{ svc: string; desc: string; amount: number }> = [];
  if (deliveryFee > 0) lines.push({ svc: order.delivery_service_type || 'Delivery', desc: `${desc} delivery`, amount: deliveryFee });
  if (billGroceries) lines.push({ svc: "Sinclair's", desc: `${desc} grocery order`, amount: groceryTotal });
  const total = lines.reduce((s, l) => s + l.amount, 0);

  const rows = lines.map((l, i) => `
    <tr>
      <td class="n">${i + 1}.</td>
      <td class="svc">${esc(l.svc)}</td>
      <td class="dsc">${esc(l.desc)}</td>
      <td class="c">1</td>
      <td class="r">${formatCurrency(l.amount)}</td>
      <td class="r amt">${formatCurrency(l.amount)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Invoice ${invoiceNumber ?? esc(order.order_number)} — Grafton Towboat Services</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
       color:#2b2b2b;background:#f4f4f2;padding:28px;font-size:13px;line-height:1.55;
       -webkit-font-smoothing:antialiased;}
  .sheet{max-width:770px;margin:0 auto;background:#fff;padding:54px 58px 46px;
         box-shadow:0 1px 4px rgba(0,0,0,.09);}
  @media print{ .toolbar{display:none;} body{padding:0;background:#fff;}
                .sheet{box-shadow:none;max-width:none;padding:0;} @page{margin:14mm;} }
  .toolbar{max-width:770px;margin:0 auto 14px;display:flex;justify-content:flex-end;}
  .toolbar button{background:#1E3D1E;color:#fff;border:0;padding:9px 22px;border-radius:6px;
                  font-size:13px;font-weight:600;cursor:pointer;}
  .mast{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;}
  .word{font-size:34px;font-weight:300;letter-spacing:7px;color:#1E3D1E;line-height:1;}
  .rule{height:2px;background:#1E3D1E;width:54px;margin-top:13px;}
  .co{font-size:12px;color:#6b6b6b;line-height:1.75;text-align:right;}
  .co b{display:block;color:#1E3D1E;font-size:13px;font-weight:600;letter-spacing:.2px;margin-bottom:2px;}
  .cols{display:flex;gap:36px;margin-top:40px;}
  .cols>div{flex:1;}
  .lbl{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;
       color:#9a9a9a;margin-bottom:8px;}
  .party{font-size:13px;line-height:1.65;}
  .party b{font-weight:600;color:#1E3D1E;}
  .kv{font-size:12.5px;line-height:1.9;}
  .kv span{display:inline-block;min-width:88px;color:#8a8a8a;}
  .kv em{font-style:normal;font-weight:600;color:#1E3D1E;}
  table{width:100%;border-collapse:collapse;margin-top:36px;}
  thead th{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;
           color:#9a9a9a;padding:0 8px 10px;text-align:left;border-bottom:1.5px solid #1E3D1E;}
  thead th.c{text-align:center;} thead th.r{text-align:right;}
  tbody td{padding:16px 8px;border-bottom:1px solid #ededed;vertical-align:top;font-size:13px;}
  td.n{color:#b4b4b4;width:26px;} td.svc{font-weight:600;color:#1E3D1E;width:27%;}
  td.dsc{color:#666;} td.c{text-align:center;color:#666;width:44px;}
  td.r{text-align:right;white-space:nowrap;} td.amt{font-weight:600;width:98px;}
  .tot{display:flex;justify-content:flex-end;margin-top:24px;}
  .tot .box{width:300px;}
  .tot .row{display:flex;justify-content:space-between;padding:7px 0;font-size:12.5px;color:#666;}
  .tot .grand{display:flex;justify-content:space-between;align-items:baseline;
              margin-top:10px;padding-top:15px;border-top:2px solid #1E3D1E;}
  .tot .grand .k{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.6px;color:#1E3D1E;}
  .tot .grand .v{font-size:26px;font-weight:600;color:#1E3D1E;letter-spacing:-.5px;}
  .pay{margin-top:42px;padding-top:20px;border-top:1px solid #ededed;
       display:flex;justify-content:space-between;gap:30px;align-items:flex-start;}
  .pay .t{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:#9a9a9a;margin-bottom:7px;}
  .pay p{font-size:11.5px;color:#7a7a7a;line-height:1.75;max-width:410px;}
  .thanks{font-size:12.5px;color:#1E3D1E;font-weight:600;white-space:nowrap;}
</style></head><body>
  <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>

  <div class="sheet">
    <div class="mast">
      <div>
        <div class="word">INVOICE</div>
        <div class="rule"></div>
      </div>
      <div class="co">
        <b>Grafton Towboat Services LLC</b>
        25 Dagget Holw<br/>
        Grafton, IL 62037-1196<br/>
        (314) 809-0853<br/>
        GraftonTowboatServices@gmail.com
      </div>
    </div>

    <div class="cols">
      <div>
        <div class="lbl">Bill to</div>
        <div class="party"><b>${esc(billTo)}</b>${order.po_number ? `<br/>PO #: ${esc(order.po_number)}` : ''}</div>
      </div>
      <div>
        <div class="lbl">Ship to</div>
        <div class="party">${order.vessel_name ? `<b>${esc(order.vessel_name)}</b><br/>` : ''}${esc(order.terminal_name || 'Grafton, IL')}</div>
      </div>
      <div>
        <div class="lbl">Invoice details</div>
        <div class="kv">
          <div><span>Invoice no.</span><em>${invoiceNumber ?? esc(order.order_number)}</em></div>
          <div><span>Terms</span>Net 30</div>
          <div><span>Invoice date</span>${dateStr}</div>
          <div><span>Due date</span>${dueStr}</div>
        </div>
      </div>
    </div>

    <table>
      <thead><tr>
        <th>#</th><th>Product or service</th><th>Description</th>
        <th class="c">Qty</th><th class="r">Rate</th><th class="r">Amount</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="6" style="padding:20px 8px;color:#aaa;">No billable delivery fee set on this order yet.</td></tr>`}</tbody>
    </table>

    <div class="tot"><div class="box">
      ${lines.map(l => `<div class="row"><span>${esc(l.svc)}</span><span>${formatCurrency(l.amount)}</span></div>`).join('')}
      <div class="grand"><span class="k">Total due</span><span class="v">${formatCurrency(total)}</span></div>
    </div></div>

    <div class="pay">
      <div>
        <div class="t">Ways to pay</div>
        <p>${!billGroceries
          ? 'Groceries are billed to you directly by Sinclair&apos;s Foods — this invoice covers Grafton Towboat Services delivery only. Remit by check or ACH and reference the invoice number above.'
          : 'Groceries reflect Sinclair&apos;s register total. Grafton Towboat Services delivery is billed separately from Sinclair&apos;s and shown here as one combined total. Remit by check or ACH and reference the invoice number above.'}</p>
      </div>
      <div class="thanks">Thank you for your business.</div>
    </div>
  </div>
</body></html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
