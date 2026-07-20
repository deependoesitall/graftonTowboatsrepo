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
  const svg = weighable ? null : upcASvg(i.upc, { moduleWidth: 2, height: 52 });
  const scanTimes = !weighable && svg && Number.isInteger(i.quantity) && i.quantity > 0
    ? `Scan<br/><b>&times;${i.quantity}</b>` : '';
  const cod = i.paid_by === 'cod';
  const oos = i.shopping_status === 'out_of_stock';

  // Out-of-stock lines NEVER print a barcode — after shopping, this sheet
  // goes to the register, and a dimmed-but-scannable code invites mis-rings.
  const barcodeBlock = oos
    ? `<div class="wgt"><div class="oos-note">OUT OF STOCK — not billed · do not scan</div></div>`
    : weighable
    ? `<div class="wgt">
         <div class="wgt-note">&#9878; BY WEIGHT — scan the <b>package label</b></div>
         <div class="wgt-line">${i.actual_weight ? `Wt: <b>${esc(String(i.actual_weight))} lb</b> (entered)` : 'Wt: __________ lb'}</div>
       </div>`
    : svg
      ? `<span class="bc">${svg}</span><span class="scan">${scanTimes}</span>`
      : `<div class="wgt"><div class="wgt-note">No barcode — key in at register</div>
         ${i.upc ? `<div class="upc-raw">UPC: ${esc(i.upc)}</div>` : ''}</div>`;

  // Compact card: qty + name on one line, meta on the next, then a single
  // row holding barcode · scan count · picked box. No dead rows — Deepen
  // (July 19): "as many scannable barcodes on a single piece of paper as
  // possible, minimize the dead spaces."
  return `<div class="item${cod ? ' cod' : ''}${oos ? ' oos' : ''}">
    <div class="line1"><span class="qty">${esc(qtyLabel)}</span><span class="desc">${esc(i.description)}</span></div>
    <div class="sub">${esc(i.pkg_size || '')}${i.pkg_size ? ' · ' : ''}${formatCurrency(i.unit_price)}${i.uom === 'LB' ? '/lb' : ''}${i.location ? ` · <b>${esc(i.location)}</b>` : ''}</div>
    ${cod ? `<div class="cod-tag">$ COD — ${esc(i.cod_name || 'crew member')} · ring separately</div>` : ''}
    ${i.paid_by === 'deck' ? `<div class="deck-tag">DECK — separate invoice line</div>` : ''}
    ${i.is_substitution ? `<div class="sub-tag">SUB</div>` : ''}
    <div class="scanrow">${barcodeBlock}<span class="check">&#9744;</span></div>
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
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10px; padding: 14px; }
  @page { margin: 8mm; }
  .toolbar { position: sticky; top: 0; background: #0b2545; color: #fff; padding: 10px 14px; border-radius: 8px;
             display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .toolbar button { background: #f2b705; border: 0; padding: 8px 22px; font-weight: bold; border-radius: 6px;
                    font-size: 13px; cursor: pointer; }
  @media print { .toolbar { display: none; } body { padding: 0; } }

  /* Dense layout — max scannable barcodes per page, minimal dead space */
  header.sheet { display: flex; justify-content: space-between; align-items: baseline;
                 border-bottom: 2px solid #0b2545; padding-bottom: 3px; margin-bottom: 5px; }
  .brand b { font-size: 13px; color: #0b2545; letter-spacing: .5px; }
  .brand span { font-size: 9px; color: #555; margin-left: 6px; }
  .ordmeta { text-align: right; font-size: 9px; line-height: 1.3; }
  .ordmeta .num { font-size: 12px; font-weight: bold; color: #0b2545; margin-right: 6px; }

  .facts { display: flex; flex-wrap: wrap; gap: 2px 14px; background: #f4f6f8; border: 1px solid #dde3ea;
           border-radius: 4px; padding: 3px 8px; margin-bottom: 5px; font-size: 9.5px; }
  .facts b { color: #0b2545; }
  .warn { background: #fdf3d7; border: 1px solid #e8cd7a; border-radius: 4px; padding: 3px 8px; margin-bottom: 5px; font-size: 9.5px; }
  .notes { background: #fff8e6; border: 1px solid #e8cd7a; border-radius: 4px; padding: 3px 8px; margin-bottom: 5px; font-size: 9.5px; }

  .dept.brk { page-break-before: always; }
  .dept-head { display: flex; align-items: baseline; gap: 8px; background: #0b2545; color: #fff;
               padding: 3px 8px; border-radius: 4px 4px 0 0; margin-top: 4px; }
  .dept-head h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  .dept-note { font-size: 8.5px; color: #cfd8e3; }

  .loc-head { background: #e8eef4; border-left: 3px solid #0b2545; font-weight: bold; font-size: 9.5px;
              padding: 2px 6px; margin-top: 3px; }
  .loc-count { font-weight: normal; color: #667; font-size: 8.5px; margin-left: 5px; }

  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; padding: 3px 0; }
  .item { border: 1px solid #c9d2dc; border-radius: 4px; padding: 3px 5px;
          break-inside: avoid; page-break-inside: avoid; }
  .item.cod { border: 1.5px solid #7c3aed; background: #faf6ff; }
  .item.oos { opacity: .45; }
  .line1 { display: flex; gap: 5px; align-items: baseline; }
  .qty { font-size: 13px; font-weight: 800; color: #0b2545; white-space: nowrap; }
  .desc { font-weight: bold; font-size: 9.5px; line-height: 1.15; }
  .sub { color: #556; font-size: 8px; }
  .cod-tag { color: #7c3aed; font-weight: bold; font-size: 8px; text-transform: uppercase; }
  .deck-tag { color: #0f766e; font-weight: bold; font-size: 8px; text-transform: uppercase; }
  .sub-tag { color: #c2410c; font-weight: bold; font-size: 8px; }

  .scanrow { display: flex; align-items: center; gap: 5px; margin-top: 2px; }
  .bc svg { height: 42px; width: auto; display: block; }
  .scan { font-size: 8.5px; line-height: 1.1; color: #333; text-align: center; }
  .scan b { font-size: 12px; }
  .wgt { flex: 1; }
  .wgt-note { font-size: 8.5px; font-weight: bold; color: #b45309; }
  .wgt-line { font-size: 9px; margin-top: 2px; color: #333; }
  .upc-raw { font-family: monospace; font-size: 8.5px; color: #555; }
  .oos-note { font-size: 8.5px; font-weight: bold; color: #999; text-transform: uppercase; }
  .check { margin-left: auto; font-size: 13px; color: #667; }

  .svc { border: 1px dashed #888; border-radius: 6px; padding: 6px 10px; margin-top: 8px; font-size: 10.5px; }
  .svc b { display: block; margin-bottom: 3px; }
  footer { margin-top: 6px; border-top: 1px solid #ccc; padding-top: 3px; font-size: 8px; color: #777;
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
 * GET) + the manager's zone order, and return the finished sheet HTML.
 * Rendered IN-APP via PickSheetOverlay (iframe) — no pop-up windows.
 */
export async function buildPickSheetForOrder(orderId: string): Promise<string> {
  let zoneOrder = DEFAULT_ZONE_ORDER;
  try {
    const cfg = await fetch('/api/order-config').then(r => (r.ok ? r.json() : null));
    if (cfg?.store_zone_order?.length) zoneOrder = cfg.store_zone_order;
  } catch { /* fall back to default zone order */ }

  const res = await fetch(`/api/orders/${orderId}`);
  if (!res.ok) throw new Error('Could not load order for pick sheet');
  const order = (await res.json()) as Order;
  return pickSheetHtml(order, zoneOrder);
}
