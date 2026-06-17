// src/lib/pdf.ts
// Generates a clean, branded, print-ready HTML order sheet for Sinclair Foods
import { Order } from '@/types';
import { formatCurrency, formatDate } from './utils';

export function generateOrderHTML(order: Order): string {
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

  // Group by category
  const grouped = order.items.reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, typeof order.items>);

  const categoryRows = Object.entries(grouped).map(([cat, items]) => {
    const catRows = items.map((item, idx) => `
      <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
        <td style="padding:6px 8px;font-size:10px;color:#888;border-bottom:1px solid #eee;font-family:monospace;">${item.upc || '—'}</td>
        <td style="padding:6px 8px;font-size:11px;color:#555;border-bottom:1px solid #eee;">${item.description}</td>
        <td style="padding:6px 8px;font-size:11px;color:#666;border-bottom:1px solid #eee;text-align:center;">${item.pkg_size || '—'}</td>
        <td style="padding:6px 8px;font-size:11px;color:#666;border-bottom:1px solid #eee;text-align:center;">${item.uom || '—'}</td>
        <td style="padding:6px 8px;font-size:12px;font-weight:700;color:#1E3D1E;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:6px 8px;font-size:11px;color:#333;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.unit_price)}</td>
        <td style="padding:6px 8px;font-size:12px;font-weight:700;color:#1E3D1E;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.line_total)}</td>
      </tr>`).join('');

    return `
      <tr>
        <td colspan="7" style="padding:5px 8px;background:#D9E84A;font-size:10px;font-weight:800;
          text-transform:uppercase;letter-spacing:1px;color:#1E3D1E;">${cat}</td>
      </tr>
      ${catRows}`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Order ${order.order_number} — Grafton Towboat Services</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size:12px; color:#222; background:#fff; }
    @page { size:letter; margin:0.5in; }
    @media print {
      .no-print { display:none !important; }
      body { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
    }
    .print-btn {
      position:fixed; top:16px; right:16px;
      background:#1E3D1E; color:#D9E84A; border:none;
      padding:10px 22px; border-radius:24px;
      font-size:13px; font-weight:800; cursor:pointer;
      text-transform:uppercase; letter-spacing:1px;
      box-shadow:0 4px 12px rgba(0,0,0,0.2);
    }
    .print-btn:hover { background:#2D5A1E; }
  </style>
</head>
<body>

<button class="print-btn no-print" onclick="window.print()">⬇ Save as PDF</button>

<!-- ===== HEADER ===== -->
<table width="100%" style="border-bottom:4px solid #1E3D1E;padding-bottom:14px;margin-bottom:16px;">
  <tr>
    <td width="60%">
      <div style="font-size:20px;font-weight:900;color:#1E3D1E;text-transform:uppercase;letter-spacing:-0.5px;">
        Grafton Towboat Services
      </div>
      <div style="font-size:11px;color:#E8640A;font-weight:700;margin:2px 0;">
        GROCERIES, SUPPLIES &amp; CREW CHANGE
      </div>
      <div style="font-size:10px;color:#555;line-height:1.6;margin-top:4px;">
        25 Dagget Hollow · Grafton, IL 62037 · Mile Marker 218<br>
        (618) 556-0290 · GraftonTowboatServices@gmail.com
      </div>
    </td>
    <td width="40%" style="text-align:right;vertical-align:top;">
      <div style="font-size:22px;font-weight:900;color:#E8640A;">${order.order_number}</div>
      <div style="font-size:10px;color:#666;margin-top:3px;line-height:1.7;">
        Date: ${formatDate(order.created_at)}<br>
        Status: <strong style="color:#1E3D1E;">${order.status.replace('_',' ').toUpperCase()}</strong><br>
        Items: <strong>${itemCount}</strong>
      </div>
    </td>
  </tr>
</table>

<!-- ===== VESSEL INFO ===== -->
<div style="background:#f0f7a0;border-left:4px solid #1E3D1E;padding:10px 14px;margin-bottom:16px;border-radius:0 4px 4px 0;">
  <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1E3D1E;margin-bottom:8px;">
    Vessel &amp; Contact Information
  </div>
  <table width="100%">
    <tr>
      <td width="33%" style="padding-bottom:6px;">
        <div style="font-size:9px;color:#666;">COMPANY / VESSEL</div>
        <div style="font-size:13px;font-weight:700;color:#1E3D1E;">${order.company_name}</div>
      </td>
      <td width="33%" style="padding-bottom:6px;">
        <div style="font-size:9px;color:#666;">CONTACT</div>
        <div style="font-size:13px;font-weight:700;color:#1E3D1E;">${order.contact_name}</div>
      </td>
      <td width="33%" style="padding-bottom:6px;">
        <div style="font-size:9px;color:#666;">PHONE</div>
        <div style="font-size:13px;font-weight:700;color:#1E3D1E;">${order.phone}</div>
      </td>
    </tr>
    ${order.po_number || order.eta ? `
    <tr>
      ${order.po_number ? `<td><div style="font-size:9px;color:#666;">PO NUMBER</div><div style="font-size:12px;font-weight:600;">${order.po_number}</div></td>` : '<td></td>'}
      ${order.eta ? `<td><div style="font-size:9px;color:#666;">VESSEL ETA</div><div style="font-size:12px;font-weight:700;color:#E8640A;">${order.eta}</div></td>` : '<td></td>'}
      <td></td>
    </tr>` : ''}
  </table>
</div>

${order.notes ? `
<div style="background:#fff8ec;border:1px solid #E8640A;padding:8px 12px;border-radius:4px;margin-bottom:16px;">
  <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#E8640A;margin-bottom:4px;">
    Special Instructions
  </div>
  <div style="font-size:11px;color:#444;line-height:1.5;">${order.notes}</div>
</div>` : ''}

<!-- ===== ORDER ITEMS ===== -->
<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1E3D1E;margin-bottom:6px;">
  Order Items — ${itemCount} items across ${Object.keys(grouped).length} categories
</div>

<table width="100%" style="border-collapse:collapse;font-size:11px;margin-bottom:16px;">
  <thead>
    <tr style="background:#1E3D1E;">
      <th style="padding:8px;text-align:left;color:#D9E84A;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;width:11%;">Item #</th>
      <th style="padding:8px;text-align:left;color:#D9E84A;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;width:32%;">Description</th>
      <th style="padding:8px;text-align:center;color:#D9E84A;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;width:11%;">Pack</th>
      <th style="padding:8px;text-align:center;color:#D9E84A;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;width:7%;">UOM</th>
      <th style="padding:8px;text-align:center;color:#D9E84A;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;width:7%;">Qty</th>
      <th style="padding:8px;text-align:right;color:#D9E84A;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;width:13%;">Unit Price</th>
      <th style="padding:8px;text-align:right;color:#D9E84A;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;width:13%;">Total</th>
    </tr>
  </thead>
  <tbody>${categoryRows}</tbody>
</table>

<!-- ===== TOTALS ===== -->
<table width="100%" style="margin-bottom:16px;">
  <tr>
    <td width="60%"></td>
    <td width="40%">
      <table width="100%" style="border-top:3px solid #1E3D1E;">
        <tr>
          <td style="padding:6px 8px;font-size:11px;color:#555;">Subtotal (${itemCount} items)</td>
          <td style="padding:6px 8px;text-align:right;font-weight:700;">${formatCurrency(order.subtotal)}</td>
        </tr>
        <tr style="background:#D9E84A;">
          <td style="padding:8px;font-size:14px;font-weight:900;color:#1E3D1E;text-transform:uppercase;">TOTAL</td>
          <td style="padding:8px;text-align:right;font-size:16px;font-weight:900;color:#1E3D1E;">${formatCurrency(order.subtotal)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- ===== SINCLAIR BOX ===== -->
<div style="border:2px solid #1E3D1E;padding:12px 16px;background:#f0f7f0;border-radius:4px;margin-bottom:16px;">
  <div style="font-size:11px;font-weight:800;color:#1E3D1E;margin-bottom:5px;">
    FOR SINCLAIR FOODS — Jerseyville, IL · (618) 498-6856 · sinclairfoods@jerseyville-il.net
  </div>
  <div style="font-size:11px;color:#444;line-height:1.6;">
    Please prepare the items above for delivery to the vessel listed.<br>
    This order was placed through Grafton Towboat Services online ordering system.<br>
    Questions: (618) 556-0290 · GraftonTowboatServices@gmail.com
  </div>
</div>

<!-- ===== FOOTER ===== -->
<div style="text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:10px;">
  Grafton Towboat Services · 25 Dagget Hollow, Grafton, IL 62037 · Mile Marker 218<br>
  ${order.order_number} · Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
</div>

</body>
</html>`;
}
