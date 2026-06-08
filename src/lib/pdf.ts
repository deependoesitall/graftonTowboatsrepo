// src/lib/pdf.ts
// Generates a print-ready HTML string for an order.
// No external dependencies — works on any server/edge runtime.

import { Order } from '@/types';
import { formatCurrency, formatDate } from './utils';

export function generateOrderHTML(order: Order): string {
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

  const grouped = order.items.reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, typeof order.items>);

  const itemRows = Object.entries(grouped).map(([cat, items]) => {
    const rows = items.map((item, idx) => `
      <tr style="background:${idx % 2 === 0 ? '#fff' : '#f9fafb'};">
        <td style="padding:7px 10px;font-size:12px;color:#555;">${cat}</td>
        <td style="padding:7px 10px;font-size:13px;font-weight:600;color:#0D1B2A;">${item.description}</td>
        <td style="padding:7px 10px;font-size:12px;color:#666;">${item.pkg_size || '—'}</td>
        <td style="padding:7px 10px;font-size:12px;text-align:center;font-weight:700;">${item.quantity}</td>
        <td style="padding:7px 10px;font-size:12px;text-align:right;">${formatCurrency(item.unit_price)}</td>
        <td style="padding:7px 10px;font-size:13px;text-align:right;font-weight:700;">${formatCurrency(item.line_total)}</td>
      </tr>`).join('');
    return rows;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${order.order_number} — Grafton Towboat Services</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, serif; font-size: 13px; color: #1a1a1a; background: #fff; }
    @page { size: letter; margin: 0.6in 0.6in 0.7in 0.6in; }
    @media print {
      .no-print { display: none !important; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }

    .header { display: flex; justify-content: space-between; align-items: flex-start;
              border-bottom: 3px solid #1B3A5C; padding-bottom: 16px; margin-bottom: 20px; }
    .brand-name { font-size: 20px; font-weight: bold; color: #1B3A5C; margin-bottom: 3px; }
    .brand-tag  { font-size: 10px; color: #1E5F8C; margin-bottom: 5px; }
    .brand-contact { font-size: 9px; color: #555; line-height: 1.6; }
    .order-num  { font-size: 18px; font-weight: bold; color: #C9922A; text-align: right; margin-bottom: 4px; }
    .order-meta { font-size: 9px; color: #666; text-align: right; line-height: 1.7; }

    .section-title { font-size: 9px; font-weight: bold; color: #1B3A5C; text-transform: uppercase;
                     letter-spacing: 1px; border-bottom: 1px solid #ddd; padding-bottom: 3px;
                     margin: 16px 0 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 4px; }
    .info-label { font-size: 9px; color: #888; margin-bottom: 2px; }
    .info-value { font-size: 12px; font-weight: bold; color: #1B3A5C; }

    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead tr { background: #1B3A5C; }
    thead th { padding: 8px 10px; text-align: left; color: #fff; font-size: 10px;
               font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
    thead th.right { text-align: right; }
    thead th.center { text-align: center; }

    .totals-box { margin-left: auto; width: 280px; margin-top: 12px; border-top: 2px solid #1B3A5C; }
    .total-row  { display: flex; justify-content: space-between; padding: 5px 10px;
                  font-size: 12px; border-bottom: 1px solid #eee; }
    .grand-row  { display: flex; justify-content: space-between; padding: 8px 10px;
                  background: #F5E6C8; border-top: 2px solid #C9922A; }
    .grand-label { font-size: 14px; font-weight: bold; color: #1B3A5C; }
    .grand-value { font-size: 16px; font-weight: bold; color: #C9922A; }

    .notes-box  { margin-top: 14px; padding: 10px 14px; background: #FFF8EC;
                  border: 1px solid #E8A93C; border-radius: 4px; }
    .notes-label{ font-size: 9px; font-weight: bold; color: #C9922A; text-transform: uppercase;
                  letter-spacing: 1px; margin-bottom: 5px; }
    .notes-text { font-size: 12px; color: #444; line-height: 1.5; }

    .sinclair-box { margin-top: 16px; padding: 12px 14px; border: 2px solid #1B3A5C;
                    background: #F0F4F8; border-radius: 4px; }
    .sinclair-title { font-size: 11px; font-weight: bold; color: #1B3A5C; margin-bottom: 5px; }
    .sinclair-text  { font-size: 11px; color: #444; line-height: 1.6; }

    .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #999;
              border-top: 1px solid #eee; padding-top: 10px; line-height: 1.8; }

    .print-btn { position: fixed; top: 20px; right: 20px; background: #1B3A5C; color: #fff;
                 border: none; padding: 10px 22px; border-radius: 6px; font-size: 14px;
                 font-weight: bold; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
    .print-btn:hover { background: #0D1B2A; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">⬇ Save / Print PDF</button>

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand-name">Grafton Towboat Services</div>
      <div class="brand-tag">Groceries, Supplies &amp; Crew Change</div>
      <div class="brand-contact">
        25 Dagget Hollow · Grafton, IL 62037<br>
        Mississippi Mile Marker 218 · IL Mile Marker 0.7<br>
        (618) 556-0290 · GraftonTowboatServices@gmail.com<br>
        Monitor Channel 68 via Grafton Harbor
      </div>
    </div>
    <div>
      <div class="order-num">${order.order_number}</div>
      <div class="order-meta">
        Ordered: ${formatDate(order.created_at)}<br>
        Status: ${order.status.toUpperCase()}<br>
        Items: ${itemCount}
      </div>
    </div>
  </div>

  <!-- Vessel Info -->
  <div class="section-title">Vessel &amp; Contact Information</div>
  <div class="info-grid">
    <div>
      <div class="info-label">Company / Vessel Name</div>
      <div class="info-value">${order.company_name}</div>
    </div>
    <div>
      <div class="info-label">Contact Person</div>
      <div class="info-value">${order.contact_name}</div>
    </div>
    <div>
      <div class="info-label">Phone Number</div>
      <div class="info-value">${order.phone}</div>
    </div>
    ${order.po_number ? `<div><div class="info-label">PO Number</div><div class="info-value">${order.po_number}</div></div>` : ''}
    ${order.eta ? `<div><div class="info-label">Vessel ETA</div><div class="info-value" style="color:#C9922A;">${order.eta}</div></div>` : ''}
  </div>

  <!-- Order Items -->
  <div class="section-title">Order Items (${itemCount} items)</div>
  <table>
    <thead>
      <tr>
        <th style="width:13%">Category</th>
        <th style="width:35%">Description</th>
        <th style="width:16%">Pack Size</th>
        <th class="center" style="width:8%">Qty</th>
        <th class="right" style="width:14%">Unit Price</th>
        <th class="right" style="width:14%">Line Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals-box">
    <div class="total-row">
      <span>Subtotal (${itemCount} items)</span>
      <span>${formatCurrency(order.subtotal)}</span>
    </div>
    <div class="grand-row">
      <span class="grand-label">TOTAL</span>
      <span class="grand-value">${formatCurrency(order.subtotal)}</span>
    </div>
  </div>

  <!-- Notes -->
  ${order.notes ? `
  <div class="notes-box">
    <div class="notes-label">Special Instructions / Notes</div>
    <div class="notes-text">${order.notes}</div>
  </div>` : ''}

  <!-- Sinclair Foods -->
  <div class="sinclair-box">
    <div class="sinclair-title">For Sinclair Foods — Grafton, IL</div>
    <div class="sinclair-text">
      This order was placed through Grafton Towboat Services digital ordering system.<br>
      Please prepare the items above for delivery to the vessel indicated.<br>
      Contact: (618) 556-0290
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    Grafton Towboat Services · 25 Dagget Hollow, Grafton, IL 62037<br>
    ${order.order_number} · Generated ${new Date().toLocaleDateString()}
  </div>
</body>
</html>`;
}
