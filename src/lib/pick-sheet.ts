// src/lib/pick-sheet.ts
// Printable barcode pick sheet — our version of the Freshop order printout
// Sinclair's shops from today (clipboard + scan gun at the register).
//
// Layout decisions from the July 10 in-store demo + Dave's July 19 texts:
//  - Compact grid ("the smaller the best") — more items per page, less paper.
//  - Sorted in STORE WALK ORDER (walkpath/zone order), not order-form order.
//  - Meat and Produce print as their own pages — those departments get their
//    section handed to them and fill it separately.
//  - Fixed-price items: scannable UPC-A barcode + "Scan N times".
//  - Weighable items (price-embedded UPCs): NO barcode — the catalog UPC would
//    scan $0.00. Picker scans the package's own scale label and writes the
//    weight on the line.
//  - COD lines flagged loudly (collected from the crew member, never invoiced).

import { Order, OrderItem } from '@/types';
import { formatCurrency, formatQty, isPoundQty } from '@/lib/utils';
import { groupByWalkingOrder, LocationGroup, DEFAULT_ZONE_ORDER } from '@/lib/store-layout';
import { upcASvg, isWeighableUpc, normalizeUpcA } from '@/lib/barcode';

function esc(s: string | null | undefined): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Is this line billed by weight? (LB uom, fractional qty, or price-embedded UPC) */
function isWeighable(i: OrderItem): boolean {
  return isPoundQty(i.uom, i.quantity) || isWeighableUpc(i.upc);
}

function itemCard(i: OrderItem): string {
  const weighable = isWeighable(i);
  const qtyLabel = formatQty(i.quantity, isPoundQty(i.uom, i.quantity));
  // Sized for first-scan reliability: at print resolution this yields bars
  // ~0.4mm wide × ~12mm tall — comfortably above UPC-A scanner minimums, so
  // even a toner-tired office printer produces gun-readable codes.
  const svg = weighable ? null : upcASvg(i.upc, { moduleWidth: 2, height: 56 });
  const scanTimes = !weighable && svg && Number.isInteger(i.quantity) && i.quantity > 0
    ? `Scan ${i.quantity} time${i.quantity === 1 ? '' : 's'}` : '';
  const cod = i.paid_by === 'cod';
  const oos = i.shopping_status === 'out_of_stock';

  const barcodeBlock = weighable
    ? `<div class="wgt">
         <div class="wgt-note">&#9878; BY WEIGHT — scan the <b>package label</b><br/>(catalog code won't ring up)</div>
         <div class="wgt-line">Weight: ______________ lb</div>
       </div>`
    : svg
      ? `<div class="bc">${svg}<div class="scan">${scanTimes}</div></div>`
      : `<div class="wgt"><div class="wgt-note">No barcode on file — key in at register</div>
         ${i.upc ? `<div class="upc-raw">UPC: ${esc(i.upc)}</div>` : ''}</div>`;

  return `<div class="item${cod ? ' cod' : ''}${oos ? ' oos' : ''}">
    <div class="item-main">
      <div class="qty">&times;${esc(qtyLabel)}</div>
      <div class="meta">
        <div class="desc">${esc(i.description)}</div>
        <div class="sub">${esc(i.pkg_size || '')}${i.pkg_size ? ' · ' : ''}${formatCurrency(i.unit_price)}${i.uom === 'LB' ? '/lb' : ''}${i.location ? ` · <b>${esc(i.location)}</b>` : ''}</div>
        ${cod ? `<div class="cod-tag">$ COD — ${esc(i.cod_name || 'crew member')} · ring separately</div>` : ''}
        ${i.paid_by === 'deck' ? `<div class="deck-tag">DECK — company-billed, separate invoice line</div>` : ''}
        ${i.is_substitution ? `<div class="sub-tag">SUB</div>` : ''}
      </div>
    </div>
    ${barcodeBlock}
    <div class="check">Picked &#9744;</div>
  </div>`;
}

function sectionHtml(title: string, note: string, groups: LocationGroup<OrderItem>[], pageBreak: boolean): string {
  if (!groups.some(g => g.items.length)) return '';
  return `<section class="dept${pageBreak ? ' brk' : ''}">
    <div class="dept-head"><h2>${esc(title)}</h2><span class="dept-note">${esc(note)}</span></div>
    ${groups.map(g => `
      <div class="loc-group">
        <div class="loc-head">${esc(g.label)} <span class="loc-count">${g.items.length} line${g.items.length === 1 ? '' : 's'}</span></div>
        <div class="grid">${g.items.map(itemCard).join('')}</div>
      </div>`).join('')}
  </section>`;
}

export function pickSheetHtml(order: Order, zoneOrder: string[] = DEFAULT_ZONE_ORDER): string {
  const grocery = order.items.filter(i => i.item_type !== 'service');
  const services = order.items.filter(i => i.item_type === 'service' && i.service_type === 'other_pickup');

  // Partition: Meat + Produce are handed to their departments as their own pages.
  const isMeat = (i: OrderItem) => /meat|seafood/i.test(i.location || '') || /^meat|seafood/i.test(i.category || '');
  const isProduce = (i: OrderItem) => /produce/i.test(i.location || '') || /^produce/i.test(i.category || '');
  const meat = grocery.filter(isMeat);
  const produce = grocery.filter(i => !isMeat(i) && isProduce(i));
  const rest = grocery.filter(i => !isMeat(i) && !isProduce(i));

  const restGroups = groupByWalkingOrder(rest, zoneOrder);
  const meatGroups = groupByWalkingOrder(meat, zoneOrder);
  const produceGroups = groupByWalkingOrder(produce, zoneOrder);

  const totalLines = grocery.length;
  const totalUnits = grocery.reduce((s, i) => s + (Number.isInteger(i.quantity) ? i.quantity : 1), 0);
  const codCount = grocery.filter(i => i.paid_by === 'cod').length;
  const weighCount = grocery.filter(isWeighable).length;
  const noBarcodeCount = grocery.filter(i => !isWeighable(i) && !normalizeUpcA(i.upc)).length;

  const placed = new Date(order.created_at);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Pick Sheet — ${esc(order.order_number)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; padding: 18px; }
  .toolbar { position: sticky; top: 0; background: #0b2545; color: #fff; padding: 10px 14px; border-radius: 8px;
             display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .toolbar button { background: #f2b705; border: 0; padding: 8px 22px; font-weight: bold; border-radius: 6px;
                    font-size: 13px; cursor: pointer; }
  @media print { .toolbar { display: none; } body { padding: 0; } }

  header.sheet { display: flex; justify-content: space-between; border-bottom: 3px solid #0b2545; padding-bottom: 8px; margin-bottom: 10px; }
  .brand b { font-size: 16px; color: #0b2545; letter-spacing: .5px; }
  .brand span { display: block; font-size: 10px; color: #555; }
  .ordmeta { text-align: right; font-size: 10px; line-height: 1.5; }
  .ordmeta .num { font-size: 15px; font-weight: bold; color: #0b2545; }

  .facts { display: flex; flex-wrap: wrap; gap: 6px 18px; background: #f4f6f8; border: 1px solid #dde3ea;
           border-radius: 6px; padding: 7px 10px; margin-bottom: 10px; font-size: 10.5px; }
  .facts b { color: #0b2545; }
  .warn { background: #fdf3d7; border: 1px solid #e8cd7a; border-radius: 6px; padding: 6px 10px; margin-bottom: 10px; font-size: 10.5px; }
  .notes { background: #fff8e6; border: 1px solid #e8cd7a; border-radius: 6px; padding: 6px 10px; margin-bottom: 10px; }

  .dept.brk { page-break-before: always; }
  .dept-head { display: flex; align-items: baseline; gap: 10px; background: #0b2545; color: #fff;
               padding: 6px 10px; border-radius: 6px 6px 0 0; margin-top: 8px; }
  .dept-head h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }
  .dept-note { font-size: 9.5px; color: #cfd8e3; }

  .loc-head { background: #e8eef4; border-left: 4px solid #0b2545; font-weight: bold; font-size: 11px;
              padding: 4px 8px; margin-top: 6px; }
  .loc-count { font-weight: normal; color: #667; font-size: 9.5px; margin-left: 6px; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; padding: 5px 0; }
  .item { border: 1px solid #c9d2dc; border-radius: 5px; padding: 5px 7px; display: flex; flex-direction: column;
          gap: 3px; break-inside: avoid; page-break-inside: avoid; }
  .item.cod { border: 2px solid #7c3aed; background: #faf6ff; }
  .item.oos { opacity: .45; }
  .item-main { display: flex; gap: 7px; align-items: flex-start; }
  .qty { font-size: 17px; font-weight: 800; color: #0b2545; min-width: 34px; }
  .desc { font-weight: bold; font-size: 11px; line-height: 1.25; }
  .sub { color: #556; font-size: 9.5px; margin-top: 1px; }
  .cod-tag { color: #7c3aed; font-weight: bold; font-size: 9px; text-transform: uppercase; margin-top: 2px; }
  .deck-tag { color: #0f766e; font-weight: bold; font-size: 9px; text-transform: uppercase; margin-top: 2px; }
  .sub-tag { color: #c2410c; font-weight: bold; font-size: 9px; }

  .bc { display: flex; align-items: center; gap: 8px; }
  .bc svg { height: 46px; width: auto; }
  .scan { font-size: 9.5px; font-weight: bold; color: #333; }
  .wgt-note { font-size: 9.5px; font-weight: bold; color: #b45309; }
  .wgt-line { font-size: 10px; margin-top: 3px; color: #333; }
  .upc-raw { font-family: monospace; font-size: 9.5px; color: #555; }
  .check { align-self: flex-end; font-size: 9px; color: #99a; }

  .svc { border: 1px dashed #888; border-radius: 6px; padding: 6px 10px; margin-top: 8px; font-size: 10.5px; }
  .svc b { display: block; margin-bottom: 3px; }
  footer { margin-top: 12px; border-top: 1px solid #ccc; padding-top: 5px; font-size: 9px; color: #777;
           display: flex; justify-content: space-between; }
</style></head>
<body>
  <div class="toolbar">
    <span><b>Pick Sheet</b> — ${esc(order.order_number)} · scan barcodes at the register like tag sheets</span>
    <button onclick="window.print()">&#128424; Print</button>
  </div>

  <header class="sheet">
    <div class="brand"><b>SINCLAIR'S FOODS</b><span>Boat order via Grafton Towboat Services</span></div>
    <div class="ordmeta">
      <div class="num">${esc(order.order_number)}</div>
      <div>Placed ${placed.toLocaleDateString()} ${placed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
      <div>Status: ${esc(order.status.replace('_', ' ').toUpperCase())}</div>
    </div>
  </header>

  <div class="facts">
    <span><b>Vessel:</b> ${esc(order.vessel_name || order.company_name)}</span>
    ${order.company_name && order.vessel_name ? `<span><b>Company:</b> ${esc(order.company_name)}</span>` : ''}
    ${order.arrival_date ? `<span><b>Arrival:</b> ${esc(order.arrival_date)}${order.arrival_time ? ` ${esc(order.arrival_time)}` : ''}</span>` : ''}
    ${order.terminal_name ? `<span><b>Deliver to:</b> ${esc(order.terminal_name)}</span>` : ''}
    <span><b>Lines:</b> ${totalLines}</span>
    <span><b>Units:</b> ${totalUnits}${weighCount ? ` + ${weighCount} by weight` : ''}</span>
    ${codCount ? `<span style="color:#7c3aed"><b>COD lines:</b> ${codCount}</span>` : ''}
  </div>

  ${weighCount || noBarcodeCount ? `<div class="warn">
    ${weighCount ? `&#9878; <b>${weighCount} by-weight item${weighCount === 1 ? '' : 's'}:</b> scan the <b>package label</b> (not this sheet) and write the weight on the line. ` : ''}
    ${noBarcodeCount ? `&#9888; <b>${noBarcodeCount} item${noBarcodeCount === 1 ? '' : 's'} without a usable barcode</b> — key in at the register.` : ''}
  </div>` : ''}

  ${order.notes ? `<div class="notes"><b>Customer notes:</b> ${esc(order.notes)}</div>` : ''}

  ${sectionHtml('Grocery', 'Walk order — start here', restGroups, false)}
  ${sectionHtml('Produce', 'Hand this page to the Produce department', produceGroups, true)}
  ${sectionHtml('Meat & Seafood', 'Hand this page to the Meat department', meatGroups, true)}

  ${services.length ? `<section class="dept brk">
    <div class="dept-head"><h2>Outside Pickups</h2><span class="dept-note">Items the customer linked from other stores — Sinclair's handles these</span></div>
    ${services.map(s => {
      const d = (s.service_details || {}) as Record<string, string>;
      return `<div class="svc"><b>${esc(s.description)}</b>
        ${d.url ? `Link: ${esc(d.url)}<br/>` : ''}
        ${d.notes ? `Details: ${esc(d.notes)}` : ''}</div>`;
    }).join('')}
  </section>` : ''}

  <footer>
    <span>Printed ${new Date().toLocaleString()}</span>
    <span>Weighable items: enter actual weight in the order after ringing up — totals auto-calculate.</span>
  </footer>
</body></html>`;
}

/**
 * Fetch the freshest copy of the order (location/image backfill happens in the
 * GET) + the manager's zone order, build the sheet, open it in a new tab.
 */
export async function openPickSheet(orderId: string): Promise<void> {
  let zoneOrder = DEFAULT_ZONE_ORDER;
  try {
    const cfg = await fetch('/api/order-config').then(r => (r.ok ? r.json() : null));
    if (cfg?.store_zone_order?.length) zoneOrder = cfg.store_zone_order;
  } catch { /* fall back to default zone order */ }

  const res = await fetch(`/api/orders/${orderId}`);
  if (!res.ok) throw new Error('Could not load order for pick sheet');
  const order = (await res.json()) as Order;

  const w = window.open('', '_blank');
  if (!w) throw new Error('Pop-up blocked — allow pop-ups to print the pick sheet');
  w.document.write(pickSheetHtml(order, zoneOrder));
  w.document.close();
}
