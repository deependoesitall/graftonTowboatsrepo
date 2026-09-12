// src/lib/pdf.ts
// Generates a clean, branded, print-ready HTML order sheet for Sinclair Foods
import { Order } from '@/types';
import { formatCurrency, formatDate, formatArrivalTime } from './utils';
import { codFeePercent, codFeeLabel, codTotalWithFee, allocateCodTotals } from '@/lib/cod-fee';
import { readCodPayments, codMethodSentence } from '@/lib/cod-payments';
import {
  splitOutsidePickups, groupCodCollect, pickupPayLabel, pickupIsPriced, lineAmount, pickupLabel,
} from '@/lib/outside-pickup';

export function generateOrderHTML(order: Order): string {
  const outOfStockMap = new Map<string, string>(
    order.items
      .filter(i => i.shopping_status === 'out_of_stock')
      .map(i => [i.id, i.description])
  );
  const itemById = new Map(order.items.map(i => [i.id, i]));
  const subsByParent = order.items
    .filter(i => i.is_substitution && i.substitutes_item_id)
    .reduce((acc, i) => {
      const k = i.substitutes_item_id as string;
      (acc[k] ||= []).push(i);
      return acc;
    }, {} as Record<string, typeof order.items>);

  // FULL AUDIT: keep OOS originals (struck) + substitutions. Do not hide OOS.
  const groceryItems = order.items.filter(i => i.item_type !== 'service');
  // Walk primaries first; nest subs under parents so the boat sees the pair.
  const parentIds = new Set(groceryItems.map(i => i.id));
  const primaryGrocery = groceryItems.filter(i => {
    if (!i.is_substitution || !i.substitutes_item_id) return true;
    return !parentIds.has(i.substitutes_item_id);
  });
  const serviceItems = order.items.filter(i => i.item_type === 'service');
  const { vessel: vesselPickups, deck: deckPickups, cod: codPickups } = splitOutsidePickups(serviceItems);
  const codItems     = groceryItems.filter(i => i.paid_by === 'cod' && i.shopping_status !== 'out_of_stock');
  const groceryCodTotal = codItems.reduce((s, i) => s + Number(i.actual_total ?? i.line_total), 0);
  const pickupCodTotal = codPickups.reduce((s, i) => s + lineAmount(i), 0);
  const codSubtotal  = groceryCodTotal + pickupCodTotal;
  // Deck lines — company-billed but listed separately from the grocery allowance
  const deckItems    = groceryItems.filter(i => i.paid_by === 'deck' && i.shopping_status !== 'out_of_stock');
  const deckSubtotal = deckItems.reduce((s, i) => s + Number(i.actual_total ?? i.line_total), 0)
    + deckPickups.reduce((s, i) => s + lineAmount(i), 0);
  // CODs separated per crew member — grocery COD + that person's Price Paid pickups
  const codByName = groupCodCollect(codItems, codPickups);
  const discounts = order.discounts || [];
  const discountTotal = Number(order.discount_total) || 0;
  // Per-person payment. Empty for orders placed before this existed; the
  // order-level codMethodLabel below is the fallback for exactly those.
  // Reads order.extended_info directly — `ext` isn't in scope until later.
  const codPayments   = readCodPayments(order.extended_info);
  const codPayByName  = new Map(codPayments.map(p => [p.name, p]));
  // Someone whose only COD is a linked item has no catalog lines, so they
  // never appear in codByName — and this sheet is what the driver collects
  // from. Leaving them off it is how a debt goes uncollected.
  const codLinkedOnly = codPayments.filter(p =>
    p.linked_items > 0 && !codByName.some(([name]) => name === p.name));
  // Cent-exact: the rows are guaranteed to sum to the header total.
  const codShares = allocateCodTotals(order, codByName.map(([name, list]) => ({
    name, subtotal: list.reduce((s, i) => s + i.amount, 0),
  })), codSubtotal);

  const codMethodLabel = order.cod_payment_method === 'credit_card' ? 'Credit Card — call to collect'
    : order.cod_payment_method === 'venmo' ? 'Venmo — send a payment request'
    : order.cod_payment_method === 'cashapp' ? 'Cash App — send a payment request'
    : order.cod_payment_method === 'cash' ? 'Cash (legacy)' : null;
  const codFeePct = codFeePercent(order);
  const isFulfilled       = order.status === 'fulfilled';
  const itemCount         = groceryItems
    .filter(i => i.shopping_status !== 'out_of_stock')
    .reduce((s, i) => s + i.quantity, 0);
  const isCrewChangeOnly  = order.crew_change !== 'no' && groceryItems.length === 0;

  function renderGroceryRow(item: typeof groceryItems[number], idx: number, nested = false): string {
    const isSub          = !!item.is_substitution;
    const isOos          = item.shopping_status === 'out_of_stock';
    const effectiveTotal = isOos ? 0 : (item.actual_total ?? item.line_total);
    const orig = isSub && item.substitutes_item_id ? itemById.get(item.substitutes_item_id) : undefined;
    const origDesc = orig?.description || (item.substitutes_item_id ? outOfStockMap.get(item.substitutes_item_id) : null);
    const matchedPref = !!(orig && orig.preferred_sub_mode === 'product'
      && orig.preferred_sub_product_id && item.product_id === orig.preferred_sub_product_id);
    const subLabel = isSub
      ? `<div style="font-size:9px;color:#E8640A;font-weight:700;margin-top:2px;">SUBSTITUTED FOR: ${origDesc || 'original item'}${matchedPref ? ' · CUSTOMER PREFERRED' : ''}</div>`
      : '';
    const oosLabel = isOos
      ? `<div style="font-size:9px;color:#888;font-weight:700;margin-top:2px;">OUT OF STOCK — not billed</div>`
      : '';
    const prefLabel = !isSub && !isOos && item.preferred_sub_mode === 'product'
      ? `<div style="font-size:9px;color:#92400e;font-weight:700;margin-top:2px;">Preferred if OOS: ${item.preferred_sub_description || 'selected product'}</div>`
      : !isSub && item.preferred_sub_mode === 'none'
      ? `<div style="font-size:9px;color:#92400e;font-weight:700;margin-top:2px;">Do not substitute</div>`
      : !isSub && item.preferred_sub_mode === 'store_choice'
      ? `<div style="font-size:9px;color:#92400e;font-weight:700;margin-top:2px;">Store chooses substitute</div>`
      : '';
    const weightLabel = item.actual_weight
      ? `<div style="font-size:9px;color:#555;margin-top:2px;">Actual weight: ${item.actual_weight} lbs</div>`
      : '';
    const codLabel = item.paid_by === 'cod'
      ? `<div style="font-size:9px;color:#9333ea;font-weight:700;margin-top:2px;">COD &mdash; ${item.cod_name || 'crew member'} pays personally (not invoiced)</div>`
      : item.paid_by === 'deck'
      ? `<div style="font-size:9px;color:#0f766e;font-weight:700;margin-top:2px;">DECK &mdash; company-billed, listed separately (not grocery allowance)</div>`
      : '';
    const rowBg    = isOos ? '#f3f4f6' : isSub ? '#fff8ec' : (idx % 2 === 0 ? '#ffffff' : '#f8f9fa');
    const bdrLeft  = isSub || nested ? 'border-left:3px solid #E8640A;' : isOos ? 'border-left:3px solid #9ca3af;' : '';
    const descStyle = isOos
      ? 'text-decoration:line-through;color:#6b7280;'
      : isSub ? 'color:#E8640A;font-weight:700;' : 'color:#555;';
    return `
      <tr style="background:${rowBg};${bdrLeft}">
        <td style="padding:6px 8px;font-size:10px;color:#888;border-bottom:1px solid #eee;font-family:monospace;">${isOos ? '—' : (item.upc || '—')}</td>
        <td style="padding:6px 8px;font-size:11px;${descStyle}border-bottom:1px solid #eee;">
          ${item.description}${oosLabel}${subLabel}${prefLabel}${weightLabel}${codLabel}
        </td>
        <td style="padding:6px 8px;font-size:11px;color:#666;border-bottom:1px solid #eee;text-align:center;">${item.pkg_size || '—'}</td>
        <td style="padding:6px 8px;font-size:11px;color:#666;border-bottom:1px solid #eee;text-align:center;">${item.uom || '—'}</td>
        <td style="padding:6px 8px;font-size:12px;font-weight:700;color:#1E3D1E;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:6px 8px;font-size:11px;color:#333;border-bottom:1px solid #eee;text-align:right;">${isOos ? '—' : formatCurrency(item.unit_price)}</td>
        <td style="padding:6px 8px;font-size:12px;font-weight:700;color:#1E3D1E;border-bottom:1px solid #eee;text-align:right;">${isOos ? '—' : formatCurrency(effectiveTotal)}</td>
      </tr>`;
  }

  // Group primaries by category; nest linked substitutions under each OOS/original.
  const grouped = primaryGrocery.reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, typeof primaryGrocery>);

  const categoryRows = Object.entries(grouped).map(([cat, items]) => {
    let idx = 0;
    const catRows = items.map(item => {
      const rows = [renderGroceryRow(item, idx++)];
      for (const sub of (subsByParent[item.id] || [])) {
        rows.push(renderGroceryRow(sub, idx++, true));
      }
      return rows.join('');
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
      : item.service_type === 'other_pickup'
      ? [
          d.url && `Link: ${d.url}`,
          d.notes && d.notes,
          pickupPayLabel(item),
          pickupIsPriced(item) ? `Price paid ${formatCurrency(lineAmount(item))}` : 'Price paid — not keyed yet',
          "Handled by Sinclair's",
        ].filter(Boolean).join(' &nbsp;&bull;&nbsp; ')
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
        25 Dagget Hollow &middot; Grafton, IL 62037 &middot; Mile Marker 219 on the Mississippi River, Mile Marker 0 on the Illinois River<br>
        (618) 556-0290 &middot; GraftonTowboatServices@gmail.com
      </div>
    </td>
    <td width="40%" style="text-align:right;vertical-align:top;">
      <div style="font-size:22px;font-weight:900;color:#E8640A;">${order.order_number}</div>
      <div style="font-size:10px;color:#666;margin-top:3px;line-height:1.7;">
        Date: ${formatDate(order.created_at)}<br>
        Status: <strong style="color:#1E3D1E;">${order.status.replace('_', ' ').toUpperCase()}</strong><br>
        ${isCrewChangeOnly ? 'Type: <strong style="color:#E8640A;">CREW CHANGE</strong>' : `Items: <strong>${itemCount}</strong>`}
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
      ${order.arrival_time ? `<td width="30%" style="padding-bottom:6px;"><div style="font-size:9px;color:#666;">ARRIVAL TIME</div><div style="font-size:13px;font-weight:700;color:#E8640A;">${formatArrivalTime(order.arrival_time)}</div></td>` : '<td></td>'}
    </tr>
    ${deliveryMethod || order.vhf_channel || order.crew_change !== 'no' ? `<tr>
      ${deliveryMethod ? `<td style="padding-bottom:4px;"><div style="font-size:9px;color:#666;">METHOD</div><div style="font-size:11px;font-weight:700;">${deliveryMethod}${approachSide ? ` &middot; ${approachSide} side` : ''}</div></td>` : '<td></td>'}
      ${order.vhf_channel ? `<td><div style="font-size:9px;color:#666;">VHF CHANNEL</div><div style="font-size:11px;font-weight:600;">${order.vhf_channel}</div></td>` : '<td></td>'}
      ${order.crew_change === 'yes'
        ? `<td><div style="font-size:9px;color:#666;">CREW CHANGE</div><div style="font-size:11px;font-weight:700;color:#E8640A;">YES &mdash; ${order.crew_arriving ?? 0} arriving / ${order.crew_departing ?? 0} departing</div></td>`
        : order.crew_change === 'maybe'
        ? `<td><div style="font-size:9px;color:#666;">CREW CHANGE</div><div style="font-size:11px;font-weight:700;color:#B45309;">MAYBE &mdash; to be confirmed</div></td>`
        : '<td></td>'}
    </tr>` : ''}
    ${ext.secondary_terminal_name ? `<tr>
      <td colspan="3" style="padding-top:6px;border-top:1px solid #eee;">
        <div style="font-size:9px;color:#666;">SECONDARY DELIVERY</div>
        <div style="font-size:11px;font-weight:600;">${ext.secondary_terminal_name}${ext.secondary_arrival_date ? ` &middot; ${ext.secondary_arrival_date}` : ''}${ext.secondary_arrival_time ? ` ${formatArrivalTime(ext.secondary_arrival_time)}` : ''}</div>
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

<!-- ===== CREW CHANGE BLOCK ===== -->
${order.crew_change === 'yes' ? `
<div style="border:3px solid #E8640A;padding:16px 20px;background:#fff8f0;border-radius:4px;margin-bottom:16px;">
  <div style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#E8640A;margin-bottom:10px;">&#9992; Crew Change Required</div>
  <table width="100%">
    <tr>
      <td width="50%" style="padding:4px 0;">
        <div style="font-size:9px;font-weight:800;text-transform:uppercase;color:#888;margin-bottom:3px;">Crew Arriving</div>
        <div style="font-size:22px;font-weight:900;color:#1E3D1E;">${order.crew_arriving ?? 0}</div>
      </td>
      <td width="50%" style="padding:4px 0;">
        <div style="font-size:9px;font-weight:800;text-transform:uppercase;color:#888;margin-bottom:3px;">Crew Departing</div>
        <div style="font-size:22px;font-weight:900;color:#E8640A;">${order.crew_departing ?? 0}</div>
      </td>
    </tr>
  </table>
  ${order.crew_change_notes ? `<div style="margin-top:8px;font-size:11px;color:#555;"><strong>Notes:</strong> ${order.crew_change_notes}</div>` : ''}
  ${order.terminal_name || order.arrival_date ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #f0d0b0;font-size:11px;color:#555;">
    ${order.terminal_name ? `<strong>Location:</strong> ${order.terminal_name}&nbsp;&nbsp;` : ''}
    ${order.arrival_date ? `<strong>Date:</strong> ${order.arrival_date}${order.arrival_time ? ` at ${formatArrivalTime(order.arrival_time)}` : ''}` : ''}
  </div>` : ''}
</div>` : ''}
${order.crew_change === 'maybe' ? `
<div style="border:3px solid #F59E0B;padding:14px 20px;background:#fffbeb;border-radius:4px;margin-bottom:16px;">
  <div style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#B45309;margin-bottom:6px;">&#9992; Possible Crew Change &mdash; To Be Confirmed</div>
  <div style="font-size:11px;color:#555;">The customer indicated a crew change may be needed. Confirm details before the vessel arrives.</div>
  ${order.crew_change_notes ? `<div style="margin-top:6px;font-size:11px;color:#555;"><strong>Customer notes:</strong> ${order.crew_change_notes}</div>` : ''}
</div>` : ''}

<!-- ===== COD ITEMS (per-line paid_by) ===== -->
${(codByName.length > 0 || codLinkedOnly.length > 0) ? `
<div style="border:3px solid #9333ea;padding:14px 20px;background:#faf5ff;border-radius:4px;margin-bottom:16px;">
  <div style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#9333ea;margin-bottom:6px;">&#36; COD Items &mdash; Collect ${formatCurrency(codTotalWithFee(order, codSubtotal))}${codFeeLabel(order, codSubtotal) !== 'no handling fee' ? ` incl. ${codFeeLabel(order, codSubtotal)}` : ''} &middot; Separated by Crew Member</div>
  <div style="font-size:11px;color:#555;">Each crew member pays their own total personally — NOT part of the company invoice.${codFeeLabel(order, codSubtotal) !== 'no handling fee' ? ` The ${codFeeLabel(order, codSubtotal)} covers payment processing.` : ''}</div>
  <div style="margin-top:6px;font-size:12px;color:#333;">
    ${codByName.map(([name, list]) => {
      const personTotal = list.reduce((s, i) => s + i.amount, 0);
      const pay = codPayByName.get(name);
      const hasPickupLine = list.some(l => l.unpriced || codPickups.some(p => p.id === l.id));
      return `<div style="margin-bottom:5px;">
        <div style="font-weight:800;color:#6b21a8;">${name} &mdash; ${formatCurrency(codShares.get(name) ?? personTotal)}${codFeePct > 0 && personTotal > 0 ? ' <span style="font-weight:400;">incl. fee</span>' : ''}${
          pay && pay.linked_items > 0 && !hasPickupLine ? ` <span style="font-weight:400;">+ ${pay.linked_items === 1 ? 'linked item' : `${pay.linked_items} linked items`}</span>` : ''
        }</div>
        ${list.map(i => `<div style="padding-left:12px;font-size:11px;color:#444;">${i.quantity}&times; ${i.description} &middot; ${i.unpriced ? 'priced when bought' : formatCurrency(i.amount)}</div>`).join('')}
        ${pay ? `<div style="padding-left:12px;font-size:11px;color:#6b21a8;"><strong>Pays by:</strong> ${codMethodSentence(pay)}</div>` : ''}
      </div>`;
    }).join('')}
    ${codLinkedOnly.map(p => `<div style="margin-bottom:5px;">
      <div style="font-weight:800;color:#6b21a8;">${p.name} &mdash; ${p.linked_items === 1 ? 'Linked item' : `${p.linked_items} linked items`} <span style="font-weight:400;">priced when bought</span></div>
      <div style="padding-left:12px;font-size:11px;color:#6b21a8;"><strong>Pays by:</strong> ${codMethodSentence(p)}</div>
    </div>`).join('')}
  </div>
  ${codPayments.length === 0 && codMethodLabel ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e9d5ff;font-size:11px;color:#6b21a8;">
    <strong>Payment method:</strong> ${codMethodLabel}${
      order.cod_payment_method === 'credit_card'
        ? ` &mdash; call ${order.cod_preferred_phone || 'the crew member'}${order.cod_contact_time ? ` (around ${order.cod_contact_time})` : ''}`
        : (order.cod_payment_method === 'venmo' || order.cod_payment_method === 'cashapp')
        ? ` &mdash; request the exact final amount to <strong>${order.cod_payment_handle || 'the account on file'}</strong>. Never accept an inbound send.`
        : ''
    }
  </div>` : ''}
</div>` : ''}

<!-- ===== PERSONAL / COD ITEMS (legacy free-text) ===== -->
${ext.personal_cod_notes ? `
<div style="border:3px solid #9333ea;padding:14px 20px;background:#faf5ff;border-radius:4px;margin-bottom:16px;">
  <div style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#9333ea;margin-bottom:6px;">&#36; Personal / COD Items &mdash; Driver: Collect Payment on Delivery</div>
  <div style="font-size:11px;color:#555;">These items are paid personally by a crew member and are NOT part of the company invoice.</div>
  <div style="margin-top:6px;font-size:12px;font-weight:700;color:#333;">${ext.personal_cod_notes}</div>
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
        ${discounts.map(d => `<tr>
          <td style="padding:4px 8px;font-size:10px;color:#15803d;font-weight:700;">&#127991; ${d.name}${d.description ? `<div style="font-weight:400;font-size:9px;color:#4d7c5f;">${d.description}</div>` : ''}</td>
          <td style="padding:4px 8px;text-align:right;font-size:11px;font-weight:800;color:#15803d;">&minus;${formatCurrency(Number(d.amount))}</td>
        </tr>`).join('')}
        ${vesselPickups.filter(pickupIsPriced).map(i => `<tr>
          <td style="padding:5px 8px;font-size:10px;color:#555;font-weight:700;">Outside pickup (boat grocery) &mdash; ${pickupLabel(i)}</td>
          <td style="padding:5px 8px;text-align:right;font-size:11px;font-weight:800;">${formatCurrency(lineAmount(i))}</td>
        </tr>`).join('')}
        ${deckItems.length > 0 || deckPickups.some(pickupIsPriced) ? `<tr>
          <td style="padding:5px 8px;font-size:10px;color:#0f766e;font-weight:700;">Deck subtotal &mdash; invoiced separately (not grocery allowance)</td>
          <td style="padding:5px 8px;text-align:right;font-size:11px;font-weight:800;color:#0f766e;">${formatCurrency(deckSubtotal)}</td>
        </tr>` : ''}
        ${codPickups.filter(pickupIsPriced).map(i => `<tr>
          <td style="padding:5px 8px;font-size:10px;color:#6b21a8;font-weight:700;">Outside pickup (COD) &mdash; ${pickupLabel(i)}</td>
          <td style="padding:5px 8px;text-align:right;font-size:11px;font-weight:800;color:#6b21a8;">${formatCurrency(lineAmount(i))}</td>
        </tr>`).join('')}
        <tr>
          <td style="padding:8px;font-size:14px;font-weight:900;color:#1E3D1E;text-transform:uppercase;">ESTIMATED TOTAL</td>
          <td style="padding:8px;text-align:right;font-size:16px;font-weight:900;color:#1E3D1E;">${formatCurrency(order.subtotal)}</td>
        </tr>
        ${discountTotal > 0 ? `<tr style="background:#dcfce7;">
          <td style="padding:7px 8px;font-size:11px;font-weight:900;color:#15803d;text-transform:uppercase;">After est. coupon savings (&minus;${formatCurrency(discountTotal)})</td>
          <td style="padding:7px 8px;text-align:right;font-size:14px;font-weight:900;color:#15803d;">${formatCurrency(Math.max(0, Number(order.subtotal) - discountTotal))}</td>
        </tr>` : ''}
      </table>
    </td>
  </tr>
</table>` : ''}

${serviceSection}

${isFulfilled ? `
<div style="border-left:3px solid #E8640A;background:#fffbf0;padding:8px 12px;margin-bottom:16px;font-size:10px;color:#555;">
  <strong style="color:#E8640A;">Note:</strong> This is your final receipt reflecting actual items delivered, including any substitutions and weight adjustments.
</div>` : ''}

<!-- ===== SINCLAIR BOX (only for grocery orders) ===== -->
${groceryItems.length > 0 ? `
<div style="border:2px solid #1E3D1E;padding:12px 16px;background:#f0f7f0;border-radius:4px;margin-bottom:16px;">
  <div style="font-size:11px;font-weight:800;color:#1E3D1E;margin-bottom:5px;">
    FOR SINCLAIR FOODS &mdash; Jerseyville, IL &middot; (618) 498-6856 &middot; sinclairfoods@jerseyville-il.net
  </div>
  <div style="font-size:11px;color:#444;line-height:1.6;">
    Please prepare the items above for delivery to <strong>${vesselName}</strong>${order.terminal_name ? ` at ${order.terminal_name}` : ''}${order.arrival_date ? `, arriving ${order.arrival_date}${order.arrival_time ? ` ${formatArrivalTime(order.arrival_time)}` : ''}` : ''}.<br>
    This order was placed through Grafton Towboat Services online ordering system.<br>
    Questions: (618) 556-0290 &middot; GraftonTowboatServices@gmail.com
  </div>
</div>` : ''}

<!-- ===== FOOTER ===== -->
<div style="text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:10px;">
  Grafton Towboat Services &middot; 25 Dagget Hollow, Grafton, IL 62037 &middot; Mile Marker 219 on the Mississippi River, Mile Marker 0 on the Illinois River<br>
  ${order.order_number} &middot; Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
</div>

</body>
</html>`;
}
