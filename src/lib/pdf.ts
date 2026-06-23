// src/lib/pdf.ts
// Generates a clean, branded, print-ready HTML order sheet for Sinclair Foods
import { Order } from '@/types';
import { formatCurrency, formatDate } from './utils';

export function generateOrderHTML(order: Order): string {
  const outOfStockMap = new Map<string, string>(
    order.items
      .filter(i => i.shopping_status === 'out_of_stock')
      .map(i => [i.id, i.description])
  );

  const groceryItems = order.items.filter(i => i.item_type !== 'service' && i.shopping_status !== 'out_of_stock');
  const serviceItems = order.items.filter(i => i.item_type === 'service');
  const isFulfilled  = order.status === 'fulfilled';
  const itemCount    = groceryItems.reduce((s, i) => s + i.quantity, 0);

  // Group groceries by category
  const grouped = groceryItems.reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, typeof groceryItems>);

  const categoryRows = Object.entries(grouped).map(([cat, items]) => {
    const catRows = items.map((item, idx) => {
      const isSub          = item.is_substitution;
      const effectiveTotal = item.actual_total ?? item.line_total;
      const origDesc       = isSub && item.substitutes_item_id
        ? outOfStockMap.get(item.substitutes_item_id) : null;
      const subLabel = isSub
        ? `<div style="font-size:9px;color:#E8640A;font-weight:700;margin-top:2px;">SUBSTITUTED FOR: ${origDesc || 'original item'}</div>`
        : '';
      const weightLabel = item.actual_weight
        ? `<div style="font-size:9px;color:#555;margin-top:2px;">Actual weight: ${item.actual_weight} lbs</div>`
        : '';
      const rowBg    = isSub ? '#fff8ec' : (idx % 2 === 0 ? '#ffffff' : '#f8f9fa');
      const bdrLeft  = isSub ? 'border-left:3px solid #E8640A;' : '';
      return `
      <tr style="background:${rowBg};${bdrLeft}">
        <td style="padding:6px 8px;font-size:10px;color:#888;border-bottom:1px solid #eee;font-family:monospace;">${item.upc || '—'}</td>
        <td style="padding:6px 8px;font-size:11px;color:${isSub ? '#E8640A' : '#555'};font-weight:${isSub ? '700' : 'normal'};border-bottom:1px solid #eee;">
          ${item.description}${subLabel}${weightLabel}
        </td>
        <td style="padding:6px 8px;font-size:11px;color:#666;border-bottom:1px solid #eee;text-align:center;">${item.pkg_size || '—'}</td>
        <td style="padding:6px 8px;font-size:11px;color:#666;border-bottom:1px solid #eee;text-align:center;">${item.uom || '—'}</td>
        <td style="padding:6px 8px;font-size:12px;font-weight:700;color:#1E3D1E;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:6px 8px;font-size:11px;color:#333;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.unit_price)}</td>
        <td style="padding:6px 8px;font-size:12px;font-weight:700;color:#1E3D1E;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(effectiveTotal)}</td>
      </tr>`;
    }).join('');
    return `
      <tr>
        <td colspan="7" style="padding:5px 8px;background:#D9E84A;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1E3D1E;">${cat}</td>
      </tr>
      ${catRows}`;
  }).join('');

  // Service items section
  const serviceSection = serviceItems.length > 0 ? `
<!-- ===== ADDITIONAL SERVICES ===== -->
<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1E3D1E;margin-bottom:6px;margin-top:16px;">
  Additional Services (${serviceItems.length})
</div>
<table width="100%" style="border-collapse:collapse;font-size:11px;margin-bottom:16px;border:1px solid #ccc;border-radius:4px;">
  ${serviceItems.map(item => {
    const d = (item.service_details || {}) as Record<string, string>;
    const details = item.service_type === 'parts_pickup'
      ? [d.pickup_location && `Pickup: ${d.pickup_location}`, d.order_number && `Order #: ${d.order_number}`, d.contact_name && `Contact: ${d.contact_name}`, d.contact_phone && `Phone: ${d.contact_phone}`].filter(Boolean).join(' &nbsp;&bull;&nbsp; ')
      : [d.description && `Item: ${d.description}`, d.origin && `From: ${d.origin}`, d.contact_name && `Contact: ${d.contact_name}`, d.contact_phone && `Phone: ${d.contact_phone}`].filter(Boolean).join(' &nbsp;&bull;&nbsp; ');
    return `<tr style="border-bottom:1px solid #eee;">
      <td style="padding:8px 10px;font-weight:700;color:#1E3D1E;width:30%;">${item.description}</td>
      <td style="padding:8px 10px;color:#555;">${details}</td>
    </tr>`;
  }).join('')}
</table>` : '';

  // Vessel info helpers
  const vesselName      = order.vessel_name   || order.company_name;
  const vesselType      = order.vessel_type    || null;
  const deliveryMethod  = order.delivery_method === 'boat' ? 'Boat Delivery' : order.delivery_method === 'van' ? 'Van Delivery' : null;
  const approachSide    = order.approach_side  ? order.approach_side.charAt(0).toUpperCase() + order.approach_side.slice(1) : null;
  const ext             = order.extended_info  || {};

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
    @media print { .no-print { display:none !important; } body { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
    .print-btn { position:fixed; top:16px; right:16px; background:#1E3D1E; color:#D9E84A; border:none; padding:10px 22px; border-radius:24px; font-size:13px; font-weight:800; cursor:pointer; text-transform:uppercase; letter-spacing:1px; box-shadow:0 4px 12px rgba(0,0,0,0.2); }
    .print-btn:hover { background:#2D5A1E; }
  </style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">&#11015; Save as PDF</button>

<!-- ===== HEADER ===== -->
<table width="100%" style="border-bottom:4px solid #1E3D1E;padding-bottom:14px;margin-bottom:16px;">
  <tr>
    <td width="60%">
      <div style="font-size:20px;font-weight:900;color:#1E3D1E;text-transform:uppercase;letter-spacing:-0.5px;">Grafton Towboat Services</div>
      <div style="font-size:11px;color:#E8640A;font-weight:700;margin:2px 0;">GROCERIES, SUPPLIES &amp; CREW CHANGE</div>
      <div style="font-size:10px;color:#555;line-height:1.6;margin-top:4px;">
        25 Dagget Hollow &middot; Grafton, IL 62037 &middot; Mile Marker 218<br>
        (618) 556-0290 &middot; GraftonTowboatServices@gmail.com
      </div>
    </td>
    <td width="40%" style="text-align:right;vertical-align:top;">
      <div style="font-size:22px;font-weight:900;color:#E8640A;">${order.order_number}</div>
      <div style="font-size:10px;color:#666;margin-top:3px;line-height:1.7;">
        Date: ${formatDate(order.created_at)}<br>
        Status: <strong style="color:#1E3D1E;">${order.status.replace('_', ' ').toUpperCase()}</strong><br>
        Items: <strong>${itemCount}</strong>
      </div>
    </td>
  </tr>
</table>

<!-- ===== VESSEL INFO ===== -->
<div style="background:#f0f7a0;border-left:4px solid #1E3D1E;padding:10px 14px;margin-bottom:12px;border-radius:0 4px 4px 0;">
  <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1E3D1E;margin-bottom:8px;">Vessel &amp; Contact Information</div>
  <table width="100%">
    <tr>
      <td width="33%" style="padding-bottom:6px;">
        <div style="font-size:9px;color:#666;">COMPANY</div>
        <div style="font-size:12px;font-weight:700;color:#1E3D1E;">${order.company_name}</div>
      </td>
      <td width="33%" style="padding-bottom:6px;">
        <div style="font-size:9px;color:#666;">BILLING CONTACT</div>
        <div style="font-size:12px;font-weight:700;color:#1E3D1E;">${order.contact_name}</div>
      </td>
      <td width="33%" style="padding-bottom:6px;">
        <div style="font-size:9px;color:#666;">PHONE</div>
        <div style="font-size:12px;font-weight:700;color:#1E3D1E;">${order.phone}</div>
      </td>
    </tr>
    ${order.customer_email || order.po_number ? `<tr>
      ${order.customer_email ? `<td style="padding-bottom:4px;"><div style="font-size:9px;color:#666;">EMAIL</div><div style="font-size:11px;font-weight:600;">${order.customer_email}</div></td>` : '<td></td>'}
      ${order.po_number ? `<td style="padding-bottom:4px;"><div style="font-size:9px;color:#666;">PO NUMBER</div><div style="font-size:11px;font-weight:600;">${order.po_number}</div></td>` : '<td></td>'}
      <td></td>
    </tr>` : ''}
  </table>
</div>

<!-- ===== VESSEL DETAILS ===== -->
${(order.vessel_name || order.captain_name) ? `
<div style="background:#f0f7a0;border-left:4px solid #1E3D1E;padding:10px 14px;margin-bottom:12px;border-radius:0 4px 4px 0;">
  <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1E3D1E;margin-bottom:8px;">Vessel Information</div>
  <table width="100%">
    <tr>
      ${order.vessel_name ? `<td width="33%" style="padding-bottom:6px;"><div style="font-size:9px;color:#666;">VESSEL NAME</div><div style="font-size:12px;font-weight:700;color:#1E3D1E;">${order.vessel_name}${vesselType ? ` <span style="font-size:10px;font-weight:normal;">(${vesselType})</span>` : ''}</div></td>` : '<td></td>'}
      ${order.captain_name ? `<td width="33%" style="padding-bottom:6px;"><div style="font-size:9px;color:#666;">CAPTAIN</div><div style="font-size:12px;font-weight:700;color:#1E3D1E;">${order.captain_name}</div></td>` : '<td></td>'}
      ${order.captain_phone ? `<td width="33%" style="padding-bottom:6px;"><div style="font-size:9px;color:#666;">CAPTAIN PHONE</div><div style="font-size:12px;font-weight:700;color:#1E3D1E;">${order.captain_phone}</div></td>` : '<td></td>'}
    </tr>
    ${ext.order_contact_name ? `<tr>
      <td style="padding-bottom:4px;"><div style="font-size:9px;color:#666;">ORDER CONTACT</div><div style="font-size:11px;font-weight:600;">${ext.order_contact_name}${ext.order_contact_title ? ` (${ext.order_contact_title})` : ''}</div></td>
      ${ext.order_contact_phone ? `<td><div style="font-size:9px;color:#666;">CONTACT PHONE</div><div style="font-size:11px;font-weight:600;">${ext.order_contact_phone}</div></td>` : '<td></td>'}
      <td></td>
    </tr>` : ''}
  </table>
</div>` : ''}

<!-- ===== DELIVERY INFO ===== -->
${(order.terminal_name || order.arrival_date) ? `
<div style="background:#fff8f0;border-left:4px solid #E8640A;padding:10px 14px;margin-bottom:12px;border-radius:0 4px 4px 0;">
  <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#E8640A;margin-bottom:8px;">Delivery Information</div>
  <table width="100%">
    <tr>
      ${order.terminal_name ? `<td width="40%" style="padding-bottom:6px;"><div style="font-size:9px;color:#666;">DELIVER TO</div><div style="font-size:13px;font-weight:900;color:#E8640A;">${order.terminal_name}</div></td>` : '<td></td>'}
      ${order.arrival_date ? `<td width="30%" style="padding-bottom:6px;"><div style="font-size:9px;color:#666;">ARRIVAL DATE</div><div style="font-size:13px;font-weight:700;color:#E8640A;">${order.arrival_date}</div></td>` : '<td></td>'}
      ${order.arrival_time ? `<td width="30%" style="padding-bottom:6px;"><div style="font-size:9px;color:#666;">ARRIVAL TIME</div><div style="font-size:13px;font-weight:700;color:#E8640A;">${order.arrival_time}</div></td>` : '<td></td>'}
    </tr>
    ${deliveryMethod || order.vhf_channel || order.crew_change ? `<tr>
      ${deliveryMethod ? `<td style="padding-bottom:4px;"><div style="font-size:9px;color:#666;">METHOD</div><div style="font-size:11px;font-weight:700;">${deliveryMethod}${approachSide ? ` &middot; ${approachSide} side` : ''}</div></td>` : '<td></td>'}
      ${order.vhf_channel ? `<td><div style="font-size:9px;color:#666;">VHF CHANNEL</div><div style="font-size:11px;font-weight:600;">${order.vhf_channel}</div></td>` : '<td></td>'}
      ${order.crew_change ? `<td><div style="font-size:9px;color:#666;">CREW CHANGE</div><div style="font-size:11px;font-weight:700;color:#E8640A;">YES &mdash; ${order.crew_arriving ?? 0} arriving / ${order.crew_departing ?? 0} departing</div></td>` : '<td></td>'}
    </tr>` : ''}
    ${ext.secondary_terminal_name ? `<tr>
      <td colspan="3" style="padding-top:6px;border-top:1px solid #eee;">
        <div style="font-size:9px;color:#666;">SECONDARY DELIVERY</div>
        <div style="font-size:11px;font-weight:600;">${ext.secondary_terminal_name}${ext.secondary_arrival_date ? ` &middot; ${ext.secondary_arrival_date}` : ''}${ext.secondary_arrival_time ? ` ${ext.secondary_arrival_time}` : ''}</div>
      </td>
    </tr>` : ''}
    ${order.eta ? `<tr><td colspan="3" style="padding-top:4px;"><div style="font-size:9px;color:#666;">ETA NOTE</div><div style="font-size:11px;">${order.eta}</div></td></tr>` : ''}
  </table>
</div>` : `
${order.eta ? `<div style="background:#fff8f0;border-left:4px solid #E8640A;padding:8px 14px;margin-bottom:12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;">Vessel ETA</div><div style="font-size:13px;font-weight:700;color:#E8640A;">${order.eta}</div></div>` : ''}
`}

${order.notes ? `
<div style="background:#fff8ec;border:1px solid #E8640A;padding:8px 12px;border-radius:4px;margin-bottom:12px;">
  <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#E8640A;margin-bottom:4px;">Special Instructions</div>
  <div style="font-size:11px;color:#444;line-height:1.5;">${order.notes}</div>
</div>` : ''}

<!-- ===== GROCERY ITEMS ===== -->
${groceryItems.length > 0 ? `
<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1E3D1E;margin-bottom:6px;">
  Grocery Items &mdash; ${itemCount} items across ${Object.keys(grouped).length} categories
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
        <tr>
          <td style="padding:8px;font-size:14px;font-weight:900;color:#1E3D1E;text-transform:uppercase;">TOTAL</td>
          <td style="padding:8px;text-align:right;font-size:16px;font-weight:900;color:#1E3D1E;">${formatCurrency(order.subtotal)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>` : ''}

${serviceSection}

${isFulfilled ? `
<div style="border-left:3px solid #E8640A;background:#fffbf0;padding:8px 12px;margin-bottom:16px;font-size:10px;color:#555;">
  <strong style="color:#E8640A;">Note:</strong> This is your final receipt reflecting actual items delivered, including any substitutions and weight adjustments.
</div>` : ''}

<!-- ===== SINCLAIR BOX ===== -->
${groceryItems.length > 0 ? `
<div style="border:2px solid #1E3D1E;padding:12px 16px;background:#f0f7f0;border-radius:4px;margin-bottom:16px;">
  <div style="font-size:11px;font-weight:800;color:#1E3D1E;margin-bottom:5px;">
    FOR SINCLAIR FOODS &mdash; Jerseyville, IL &middot; (618) 498-6856 &middot; sinclairfoods@jerseyville-il.net
  </div>
  <div style="font-size:11px;color:#444;line-height:1.6;">
    Please prepare the items above for delivery to <strong>${vesselName}</strong>${order.terminal_name ? ` at ${order.terminal_name}` : ''}${order.arrival_date ? `, arriving ${order.arrival_date}${order.arrival_time ? ` ${order.arrival_time}` : ''}` : ''}.<br>
    This order was placed through Grafton Towboat Services online ordering system.<br>
    Questions: (618) 556-0290 &middot; GraftonTowboatServices@gmail.com
  </div>
</div>` : ''}

<!-- ===== FOOTER ===== -->
<div style="text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:10px;">
  Grafton Towboat Services &middot; 25 Dagget Hollow, Grafton, IL 62037 &middot; Mile Marker 218<br>
  ${order.order_number} &middot; Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
</div>

</body>
</html>`;
}
