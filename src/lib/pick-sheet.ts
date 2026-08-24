// src/lib/pick-sheet.ts
// Printable barcode pick sheet — our version of the Freshop order printout
// Sinclair's shops from today (clipboard + scan gun at the register).
//
// Layout decisions from the July 10 in-store demo + Dave's July 19 texts:
//  - Compact grid ("the smaller the best") — more items per page, less paper.
//  - Sorted in STORE WALK ORDER (walkpath/zone order), not order-form order.
//  - ONE continuous walk in the order set in Settings → Store Layout. Meat and
//    Produce used to print as separate pages AFTER everything else, which
//    silently overrode that setting; they now appear at their configured point.
//  - Grocery / Deck / COD print as three separate blocks — different people
//    shop them, they're bagged separately, and deck is invoiced on its own.
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

/**
 * Sale line in Sinclair's own Freshop format:  $8.53 (08/10/26 - 09/06/26) $9.19
 *
 * Dave, comparing our sheet to his: "on ours, it will actually show if there is
 * a price reduction, how long it's good for... Ideally, on the pick sheet on
 * the barcodes like this."
 *
 * The dates matter more than the saving: they're the answer when a boat asks
 * why Wednesday's price differs from what they saw on Monday.
 */
function salePriceHtml(i: OrderItem): string {
  const regular = Number(i.regular_price ?? 0);
  if (!regular || regular <= Number(i.unit_price)) return '';
  const end = (i.sale_finish_date || '').slice(0, 10);
  const short = (d: string) => {
    const [y, m, day] = d.split('-');
    return y && m && day ? `${m}/${day}/${y.slice(2)}` : '';
  };
  return `<span class="sale">${formatCurrency(i.unit_price)}${
    end ? ` <span class="sale-dates">(thru ${short(end)})</span>` : ''
  } <s>${formatCurrency(regular)}</s></span>`;
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
  // Thumbnail on every line. Dave: "I do think that every item needs a picture...
  // you shop pictures, you don't shop words." Freshop puts one left of the
  // department on each row; a blank box is itself useful — it tells whoever is
  // walking the store that this line has no photo to match against.
  const thumb = i.image_url
    ? `<img class="thumb" src="${esc(i.image_url)}" alt=""/>`
    : `<span class="thumb thumb-empty"></span>`;

  return `<div class="item${cod ? ' cod' : ''}${oos ? ' oos' : ''}">
    <div class="line1">${thumb}<span class="qty">${esc(qtyLabel)}</span><span class="desc">${esc(i.description)}</span></div>
    <div class="sub">${esc(i.pkg_size || '')}${i.pkg_size ? ' · ' : ''}${
      salePriceHtml(i) || formatCurrency(i.unit_price)
    }${i.uom === 'LB' ? '/lb' : ''}${i.location ? ` · <b>${esc(i.location)}</b>` : ''}</div>
    ${cod ? `<div class="cod-tag">$ COD — ${esc(i.cod_name || 'crew member')} · ring separately</div>` : ''}
    ${i.paid_by === 'deck' ? `<div class="deck-tag">DECK — separate invoice line</div>` : ''}
    ${i.is_substitution ? `<div class="sub-tag">SUB</div>` : ''}
    <div class="scanrow">${barcodeBlock}<span class="check">&#9744;</span></div>
  </div>`;
}

function sectionHtml(
  title: string,
  note: string,
  groups: LocationGroup<OrderItem>[],
  opts: { subtotal?: number; tone?: 'grocery' | 'deck' | 'cod'; newPage?: boolean } = {},
): string {
  if (!groups.some(g => g.items.length)) return '';
  const lines = groups.reduce((s, g) => s + g.items.length, 0);
  return `<section class="dept${opts.tone ? ` tone-${opts.tone}` : ''}${opts.newPage ? ' newpage' : ''}">
    <div class="dept-head"><h2>${esc(title)}</h2><span class="dept-note">${esc(note)}</span>
      <span class="dept-total">${lines} line${lines === 1 ? '' : 's'}${
        opts.subtotal != null ? ` &middot; <b>${formatCurrency(opts.subtotal)}</b>` : ''
      }</span></div>
    ${groups.map(g => `
      <div class="loc-group">
        <div class="loc-head">${esc(g.label)} <span class="loc-count">${g.items.length} line${g.items.length === 1 ? '' : 's'}</span></div>
        <div class="grid">${g.items.map(itemCard).join('')}</div>
      </div>`).join('')}
  </section>`;
}

/**
 * Turn a raw shopping URL into something usable on PAPER.
 *
 * A Walmart link is ~200 characters of tracking query string. Printed in full
 * it wraps over four lines, buries the actual instruction, and still can't be
 * typed by hand. But the readable product slug is right there in the path
 * ("/ip/VIZIO-55-Mini-LED-Quantum-4K-QLED-HDR-Smart-TV-NEW-VQM55C-10/7751017286"),
 * so we surface that as the heading and keep a trimmed, query-free path as a
 * small reference line for anyone cross-checking on a phone.
 */
function readableLink(raw: string): { host: string; label: string; path: string } {
  const url = (raw || '').trim();
  if (!url) return { host: '', label: '', path: '' };
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '');
    const segs = u.pathname.split('/').filter(Boolean);
    // The slug is the long hyphenated segment; ids are short or all digits.
    const slug = segs
      .filter(seg => seg.includes('-') && /[a-z]/i.test(seg) && seg.length > 10)
      .sort((a, b) => b.length - a.length)[0] || '';
    const label = slug
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90);
    return { host, label, path: `${host}${u.pathname}`.slice(0, 160) };
  } catch {
    // Not a parseable URL — show it verbatim, trimmed.
    return { host: '', label: '', path: url.slice(0, 160) };
  }
}

export function pickSheetHtml(order: Order, zoneOrder: string[] = DEFAULT_ZONE_ORDER): string {
  const allStock = order.items.filter(i => i.item_type !== 'service');
  const services = order.items.filter(i => i.item_type === 'service' && i.service_type === 'other_pickup');

  // ── THREE SEPARATE JOBS, THREE SEPARATE BLOCKS ──
  // Dave, at the August demo: "we typically have somebody else work on the CODs,
  // somebody else works on the grocery list" — and the CODs get bagged and
  // labelled per person. Mixed into the walk order they were unfindable, so:
  //
  //   GROCERY — the boat's order, billed to the company monthly
  //   DECK    — company-billed but invoiced SEPARATELY (doesn't hit the boat's
  //             grocery allowance), so it's bagged and totalled on its own
  //   COD     — dead last, grouped by crew member, each person paying their own
  //
  // Each block carries its own subtotal, which is what makes keying two register
  // totals (grocery + deck) straightforward at the till.
  const grocery = allStock.filter(i => i.paid_by !== 'deck' && i.paid_by !== 'cod');
  const deck    = allStock.filter(i => i.paid_by === 'deck');
  const cod     = allStock.filter(i => i.paid_by === 'cod');

  // ── ONE WALK, IN THE ORDER THE MANAGER CONFIGURED ──
  // This used to pull Meat and Produce out into their own sections printed
  // AFTER everything else. That silently overrode Settings → Store Layout: a
  // manager who put Produce first still got it printed last, and the sheet no
  // longer matched the route a shopper actually walks. Dave, describing his own
  // sheet: "this is just going in order of the actual walking layout."
  //
  // So the grocery block is now a single continuous run and groupByWalkingOrder
  // places every department exactly where the configured zone order says. Meat
  // and Produce still print as their own labelled groups — they just appear at
  // the right point in the walk instead of at the end.
  const groceryGroups = groupByWalkingOrder(grocery, zoneOrder);
  const deckGroups = groupByWalkingOrder(deck, zoneOrder);

  // COD grouped by crew member — the bagging unit. Walk order applies WITHIN a
  // person, because whoever pulls the CODs still walks the store to do it.
  const codByPerson = Array.from(
    cod.reduce((acc, i) => {
      const name = (i.cod_name || '').trim() || 'Unnamed crew member';
      if (!acc.has(name)) acc.set(name, [] as OrderItem[]);
      acc.get(name)!.push(i);
      return acc;
    }, new Map<string, OrderItem[]>()).entries()
  ).sort((a, b) => a[0].localeCompare(b[0]));

  const lineTotal = (i: OrderItem) => Number(i.actual_total ?? i.line_total ?? 0);
  const sumOf = (list: OrderItem[]) =>
    list.filter(i => i.shopping_status !== 'out_of_stock').reduce((s, i) => s + lineTotal(i), 0);
  const grocerySubtotal = sumOf(grocery);
  const deckSubtotal = sumOf(deck);
  const codSubtotal = sumOf(cod);

  // Freshop's header counts: distinct lines vs units in the basket.
  const uniqueItemCount = allStock.length;
  const totalItemCount = allStock.reduce((s, i) => s + (Number.isInteger(i.quantity) ? i.quantity : 1), 0);
  const totalLines = uniqueItemCount;
  const totalUnits = totalItemCount;
  const codCount = cod.length;
  const weighCount = allStock.filter(isWeighable).length;
  const noBarcodeCount = allStock.filter(i => !isWeighable(i) && !normalizeUpcA(i.upc)).length;

  const placed = new Date(order.created_at);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Pick Sheet — ${esc(order.order_number)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10px; padding: 14px; }
  /* LANDSCAPE. Dave, on the portrait sheet I brought: "this should have been
     landscaped, so that there's more barcodes on it." Wider page = 4 cards
     per row instead of 3, which is ~25% fewer pages per order. */
  @page { size: letter landscape; margin: 8mm; }
  @media print { body { padding: 0; } }

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

  /* No forced page-breaks — let the browser pack as many cards per page as fit.
     Meat & Seafood / Produce section headers are the department handoff cue. */
  .dept-head { display: flex; align-items: baseline; gap: 8px; background: #0b2545; color: #fff;
               padding: 3px 8px; border-radius: 4px 4px 0 0; margin-top: 4px; }
  .dept-head h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  .dept-note { font-size: 8.5px; color: #cfd8e3; }

  .loc-head { background: #e8eef4; border-left: 3px solid #0b2545; font-weight: bold; font-size: 9.5px;
              padding: 2px 6px; margin-top: 3px; }
  .loc-count { font-weight: normal; color: #667; font-size: 8.5px; margin-left: 5px; }

  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; padding: 3px 0; }
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
  .sale { color: #b91c1c; font-weight: 700; }
  .sale s { color: #888; font-weight: 400; }
  .sale-dates { color: #b91c1c; font-weight: 400; font-size: 7.5px; }

  /* ── Thumbnails ── small enough to keep the grid dense, big enough to
     recognise a package at arm's length on a moving cart. */
  .thumb { width: 22px; height: 22px; object-fit: contain; flex: 0 0 auto;
           border: 1px solid #e3e3e3; border-radius: 3px; background: #fff; margin-right: 4px; }
  .thumb-empty { display: inline-block; background: repeating-linear-gradient(
                   45deg, #f4f4f4, #f4f4f4 3px, #e9e9e9 3px, #e9e9e9 6px); }

  /* ── Section tones ── a shopper holding three stapled blocks needs to know
     which one they're in without reading the header. */
  .dept-total { margin-left: auto; font-size: 9px; color: #e8eef7; white-space: nowrap; }
  .counts { display: flex; gap: 26px; margin: 6px 0 2px; }
  .count-label { display: block; font-size: 9.5px; font-weight: 800; color: #333; line-height: 1.15; }
  .count-value { display: block; font-size: 12px; color: #111; margin-top: 2px; }
  .tone-deck  .dept-head { background: #0f766e; }
  .tone-cod   .dept-head { background: #6b21a8; }
  /* Deck and COD start on their own page — different people, different bags,
     different totals. Grocery flows continuously as before. */
  .newpage { page-break-before: always; break-before: page; }

  .cod-person { border: 1.5px solid #6b21a8; border-radius: 6px; margin-top: 8px;
                break-inside: avoid; page-break-inside: avoid; }
  .cod-person-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
                     background: #f3e8ff; border-bottom: 1px solid #d8b4fe; padding: 5px 8px; }
  .cod-name { font-size: 13px; font-weight: 900; color: #5b21b6; text-transform: uppercase; letter-spacing: 0.5px; }
  .cod-person-total { font-size: 10px; color: #6b21a8; }
  .cod-bag { margin-left: auto; font-size: 9.5px; color: #6b21a8; }
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

  .svc { border: 1px solid #444; border-radius: 6px; padding: 8px 10px; margin-top: 8px; font-size: 11px;
         break-inside: avoid; page-break-inside: avoid; }
  .svc-top { display: flex; align-items: flex-start; gap: 7px; }
  .svc b { font-size: 13px; line-height: 1.25; flex: 1; }
  .tick { width: 13px; height: 13px; border: 1.5px solid #333; border-radius: 3px; flex: 0 0 auto; margin-top: 1px; }
  .cod-pill { background:#f3e8ff; color:#5b21b6; border:1px solid #c4a7f5; font-weight:700;
              font-size:9.5px; padding:2px 6px; border-radius:9px; white-space:nowrap; flex:0 0 auto; }
  .boat-pill { background:#eef4ee; color:#2f5d3a; border:1px solid #c9dbcd; font-weight:700;
                  font-size:9.5px; padding:2px 6px; border-radius:9px; white-space:nowrap; flex:0 0 auto; }
  .svc-src { margin: 4px 0 0 20px; font-size: 10.5px; font-weight: 700; color: #333; }
  .svc-note { margin: 2px 0 0 20px; font-size: 10px; color: #444; }
  /* Reference only — a shopper is not typing this. Small, grey, last. */
  .svc-url { margin: 3px 0 0 20px; font-size: 8px; color: #888; word-break: break-all; font-family: monospace; }
  .svc-warn { margin: 5px 0 0 20px; font-size: 9.5px; font-weight: 700; color: #6b21a8; }
  /* Separate errand — start it on its own page so it can't be missed at the
     bottom of the meat section. */
  .outside { page-break-before: always; break-before: page; }
  footer { margin-top: 6px; border-top: 1px solid #ccc; padding-top: 3px; font-size: 8px; color: #777;
           display: flex; justify-content: space-between; }
</style></head>
<body>
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
    ${codCount ? `<span style="color:#7c3aed"><b>COD lines:</b> ${codCount}</span>` : ''}
    ${services.length ? `<span style="color:#b45309"><b>Outside pickups:</b> ${services.length} (separate trip)</span>` : ''}
  </div>

  ${/* Counts in Sinclair's own Freshop layout — stacked label over value. Dave
        says he never reads them, but they're the record-keeping figure that
        reconciles a picked order against what was ordered. */''}
  <div class="counts">
    <div><span class="count-label">Unique Item<br/>Count</span><span class="count-value">${uniqueItemCount}</span></div>
    <div><span class="count-label">Total Item<br/>Count</span><span class="count-value">${totalItemCount}</span></div>
    ${weighCount ? `<div><span class="count-label">By Weight<br/>Count</span><span class="count-value">${weighCount}</span></div>` : ''}
  </div>

  ${weighCount || noBarcodeCount ? `<div class="warn">
    ${weighCount ? `&#9878; <b>${weighCount} by-weight item${weighCount === 1 ? '' : 's'}:</b> scan the <b>package label</b> (not this sheet) and write the weight on the line. ` : ''}
    ${noBarcodeCount ? `&#9888; <b>${noBarcodeCount} item${noBarcodeCount === 1 ? '' : 's'} without a usable barcode</b> — key in at the register.` : ''}
  </div>` : ''}

  ${order.notes ? `<div class="notes"><b>Customer notes:</b> ${esc(order.notes)}</div>` : ''}

  ${sectionHtml(
    'Grocery',
    'Walk order — start here · boat allowance · billed monthly',
    groceryGroups,
    { subtotal: grocerySubtotal, tone: 'grocery' },
  )}

  ${/* DECK — company-billed but invoiced separately, so it is bagged and rung
        on its own. Its own page: the boat wants to see the deck total apart
        from the grocery total, and that means a second register total. */''}
  ${sectionHtml(
    'Deck Supplies',
    'Bag & ring SEPARATELY — not part of the boat’s grocery allowance',
    deckGroups,
    { subtotal: deckSubtotal, tone: 'deck', newPage: true },
  )}

  ${/* COD — dead last, grouped by the person paying. Dave: "we typically have
        somebody else work on the CODs, somebody else works on the grocery
        list", and each person's items get bagged and labelled with their name.
        Mixed into the walk order these were effectively unfindable. */''}
  ${codByPerson.length ? `<section class="dept tone-cod newpage">
    <div class="dept-head"><h2>COD &mdash; collect from each crew member</h2>
      <span class="dept-note">Paid personally &middot; NEVER on the company invoice &middot; bag &amp; label per person</span>
      <span class="dept-total">${cod.length} line${cod.length === 1 ? '' : 's'} &middot; <b>${formatCurrency(codSubtotal)}</b></span></div>
    ${codByPerson.map(([name, list]) => {
      const personTotal = list
        .filter(i => i.shopping_status !== 'out_of_stock')
        .reduce((s, i) => s + lineTotal(i), 0);
      return `<div class="cod-person">
        <div class="cod-person-head">
          <span class="cod-name">${esc(name)}</span>
          <span class="cod-person-total">${list.length} line${list.length === 1 ? '' : 's'} &middot; <b>${formatCurrency(personTotal)}</b></span>
          <span class="cod-bag">Bag &amp; label: <b>${esc(name)}</b></span>
        </div>
        <div class="grid">${groupByWalkingOrder(list, zoneOrder)
          .flatMap(g => g.items)
          .map(itemCard).join('')}</div>
      </div>`;
    }).join('')}
  </section>` : ''}

  ${services.length ? `<section class="dept outside">
    <div class="dept-head"><h2>Outside Pickups &mdash; separate trip</h2><span class="dept-note">Not in the store. Sinclair's buys these elsewhere and they ride with the order.</span></div>
    ${services.map(s => {
      const d = (s.service_details || {}) as Record<string, string>;
      const isCod = d.paid_by === 'cod';
      const who = (d.cod_name || '').trim();
      const link = readableLink(d.url || '');
      // WHAT TO BUY leads. The stored description is "Other Third-Party Item
      // 1 of 2", which tells a shopper nothing — the customer's own note, or
      // the product slug out of the URL, is the actual instruction. The raw
      // link is reference only: nobody is typing 200 characters of Walmart
      // query string off a printed page.
      const heading = (d.notes || '').trim() || link.label || esc(s.description);
      return `<div class="svc">
        <div class="svc-top">
          <span class="tick"></span>
          <b>${esc(heading)}</b>
          ${/* EVERY outside pickup is COD — collected at delivery, never on the
                monthly invoice. The only question is who settles it: a named
                crew member, or the boat. "On boat's bill" read like it went on
                the company account, which is the opposite of what happens. */''}
          ${isCod
            ? `<span class="cod-pill">COD &mdash; ${who ? esc(who) : 'NAME MISSING'}</span>`
            : `<span class="boat-pill">COD &mdash; to the boat</span>`}
        </div>
        ${link.host ? `<div class="svc-src">${esc(link.host)}${link.label ? ` &middot; ${esc(link.label)}` : ''}</div>` : ''}
        ${d.notes && link.label && d.notes.trim() !== link.label ? `<div class="svc-note">Note: ${esc(d.notes)}</div>` : ''}
        ${link.path ? `<div class="svc-url">${esc(link.path)}</div>` : ''}
        ${isCod ? `<div class="svc-warn">&#9888; Crew member's own purchase &mdash; collect from them, keep the receipt.</div>` : ''}
      </div>`;
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
