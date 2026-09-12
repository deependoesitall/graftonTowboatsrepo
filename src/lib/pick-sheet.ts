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
import { formatCurrency, formatQty, isPoundQty, formatArrivalTime } from '@/lib/utils';
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
const shortDate = (d: string) => {
  const [y, m, day] = d.split('-');
  return y && m && day ? `${m}/${day}/${y.slice(2)}` : '';
};

/** Today in Sinclair's timezone — the sheet is printed and shopped in Jerseyville. */
function shoppingDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

/**
 * Did this line's shelf sale lapse between ordering and shopping?
 *
 * `regular_price` is only populated when the item was on sale AT ORDER TIME
 * (migration 060), so its presence means "the boat was quoted a sale price".
 * If the sale window has since closed, the register will ring the regular
 * price and the customer's estimate is short.
 */
function saleLapsed(i: OrderItem, today: string): boolean {
  const regular = Number(i.regular_price ?? 0);
  if (!regular || regular <= Number(i.unit_price)) return false;
  const end = (i.sale_finish_date || '').slice(0, 10);
  return !!end && end < today;
}

function salePriceHtml(i: OrderItem, today: string): string {
  const regular = Number(i.regular_price ?? 0);
  if (!regular || regular <= Number(i.unit_price)) return '';
  const end = (i.sale_finish_date || '').slice(0, 10);
  const lapsed = saleLapsed(i, today);
  // A lapsed sale is a decision, not a note — see expiredSaleHtml below. The
  // price line just stops pretending the sale is still on.
  const cls = lapsed ? 'sale sale-dead' : 'sale';
  return `<span class="${cls}">${formatCurrency(i.unit_price)}${
    end ? ` <span class="sale-dates">(${lapsed ? 'ended' : 'thru'} ${shortDate(end)})</span>` : ''
  } <s>${formatCurrency(regular)}</s></span>`;
}

/**
 * THE SALE-EXPIRY CALL — Dave's ask, from the July demo.
 *
 * Sinclair's shelf sales auto-apply at their register. They are NOT the digital
 * coupons (that engine is switched off); these are the red-text reductions on
 * their own site, and they run on fixed date windows.
 *
 * A boat can order Thursday against a sale that ends Saturday and take delivery
 * Monday. The customer was quoted the sale price; by shopping day the register
 * will ring the regular one. Dave wanted to SEE that on the sheet so he can
 * decide, item by item, whether to honour it anyway — sometimes he will, and
 * sometimes he won't.
 *
 * So this doesn't decide anything. It surfaces the fact and the money, and
 * leaves a box for the human holding the sheet.
 */
function expiredSaleHtml(i: OrderItem, today: string): string {
  if (!saleLapsed(i, today)) return '';
  const regular = Number(i.regular_price);
  const quoted = Number(i.unit_price);
  const qty = Number(i.quantity) || 1;
  const diff = (regular - quoted) * qty;
  const end = (i.sale_finish_date || '').slice(0, 10);
  return `<div class="sale-expired">
    <b>SALE ENDED ${shortDate(end)}</b> — boat was quoted ${formatCurrency(quoted)},
    register will ring ${formatCurrency(regular)}
    <span class="sale-diff">(${formatCurrency(diff)} more${qty > 1 ? ` on ${qty}` : ''})</span>
    <label class="sale-honor">&#9744; honored anyway</label>
  </div>`;
}

/** Is this line billed by weight? (LB uom, fractional qty, or price-embedded UPC) */
function isWeighable(i: OrderItem): boolean {
  return isPoundQty(i.uom, i.quantity) || isWeighableUpc(i.upc);
}

/** Build parent → substitution children map (Freshop pairing). */
function subsByParent(items: OrderItem[]): Map<string, OrderItem[]> {
  const m = new Map<string, OrderItem[]>();
  for (const i of items) {
    if (!i.is_substitution || !i.substitutes_item_id) continue;
    const k = i.substitutes_item_id;
    const list = m.get(k) || [];
    list.push(i);
    m.set(k, list);
  }
  return m;
}

function preferredNoteHtml(i: OrderItem): string {
  const mode = i.preferred_sub_mode;
  if (!mode) return '';
  if (mode === 'none') {
    return `<div class="pref-note">CUSTOMER: DO NOT SUBSTITUTE</div>`;
  }
  if (mode === 'store_choice') {
    return `<div class="pref-note">CUSTOMER: STORE CHOOSES SUBSTITUTE</div>`;
  }
  if (mode === 'product') {
    const name = (i.preferred_sub_description || '').trim() || 'preferred product';
    return `<div class="pref-note">CUSTOMER PREFERRED SUB: ${esc(name)}</div>`;
  }
  return '';
}

function matchedCustomerPreferred(original: OrderItem | undefined, sub: OrderItem): boolean {
  if (!original) return false;
  if (original.preferred_sub_mode !== 'product' || !original.preferred_sub_product_id) return false;
  return !!sub.product_id && sub.product_id === original.preferred_sub_product_id;
}

function itemCard(
  i: OrderItem,
  today: string,
  opts: {
    original?: OrderItem;
    /** Nested under an OOS/original card (Freshop pairing). */
    nested?: boolean;
  } = {},
): string {
  const weighable = isWeighable(i);
  const qtyLabel = formatQty(i.quantity, isPoundQty(i.uom, i.quantity));
  // Sized for first-scan reliability: at print resolution this yields bars
  // ~0.4mm wide × ~12mm tall — comfortably above UPC-A scanner minimums, so
  // even a toner-tired office printer produces gun-readable codes.
  // KEEP restored sizes: moduleWidth 2 / height 52 / CSS .bc svg 42px / thumbs 38px / 4-col.
  const svg = weighable ? null : upcASvg(i.upc, { moduleWidth: 2, height: 52 });
  const scanTimes = !weighable && svg && Number.isInteger(i.quantity) && i.quantity > 0
    ? `Scan<br/><b>&times;${i.quantity}</b>` : '';
  const cod = i.paid_by === 'cod';
  const oos = i.shopping_status === 'out_of_stock';
  const isSub = !!i.is_substitution;
  const orig = opts.original;
  const customerPref = isSub && matchedCustomerPreferred(orig, i);

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

  const thumb = i.image_url
    ? `<img class="thumb" src="${esc(i.image_url)}" alt=""/>`
    : `<span class="thumb thumb-empty"></span>`;

  const descClass = oos ? 'desc struck' : 'desc';
  const subForTag = isSub
    ? `<div class="sub-tag">SUB FOR: ${esc(orig?.description || 'original item')}${
        customerPref ? ' · CUSTOMER PREFERRED' : ''
      }</div>`
    : '';
  // Pending (not yet shopped) preferred note so Sinclair sees it while walking
  const prefPending =
    !oos && !isSub && i.shopping_status === 'pending' ? preferredNoteHtml(i) : '';
  // Also show preferred on OOS card when a sub has not been applied yet
  const prefOnOos =
    oos && !isSub ? preferredNoteHtml(i) : '';

  const classes = [
    'item',
    cod ? 'cod' : '',
    oos ? 'oos' : '',
    isSub ? 'is-sub' : '',
    opts.nested ? 'nested' : '',
  ].filter(Boolean).join(' ');

  return `<div class="${classes}">
    <div class="line1">${thumb}<span class="qty">${esc(qtyLabel)}</span><span class="${descClass}">${esc(i.description)}</span></div>
    <div class="sub">${esc(i.pkg_size || '')}${i.pkg_size ? ' · ' : ''}${
      salePriceHtml(i, today) || formatCurrency(i.unit_price)
    }${i.uom === 'LB' ? '/lb' : ''}${i.location ? ` · <b>${esc(i.location)}</b>` : ''}</div>
    ${cod ? `<div class="cod-tag">$ COD — ${esc(i.cod_name || 'crew member')} · ring separately</div>` : ''}
    ${i.paid_by === 'deck' ? `<div class="deck-tag">DECK — separate invoice line</div>` : ''}
    ${subForTag}
    ${prefPending}${prefOnOos}
    ${expiredSaleHtml(i, today)}
    <div class="scanrow">${barcodeBlock}<span class="check">&#9744;</span></div>
  </div>`;
}

/** Render primary line + any linked substitution cards nested under it. */
function itemPairHtml(
  i: OrderItem,
  today: string,
  byParent: Map<string, OrderItem[]>,
): string {
  const kids = byParent.get(i.id) || [];
  const primary = itemCard(i, today);
  if (!kids.length) return primary;
  const nested = kids.map(s => itemCard(s, today, { original: i, nested: true })).join('');
  return `<div class="pair">${primary}${nested}</div>`;
}

function sectionHtml(
  title: string,
  note: string,
  groups: LocationGroup<OrderItem>[],
  today: string,
  opts: {
    subtotal?: number;
    tone?: 'grocery' | 'deck' | 'cod';
    newPage?: boolean;
    /** Parent → subs map so OOS originals keep their swap cards nearby. */
    byParent?: Map<string, OrderItem[]>;
  } = {},
): string {
  if (!groups.some(g => g.items.length)) return '';
  const byParent = opts.byParent || new Map<string, OrderItem[]>();
  const lines = groups.reduce((s, g) => s + g.items.length, 0);
  return `<section class="dept${opts.tone ? ` tone-${opts.tone}` : ''}${opts.newPage ? ' newpage' : ''}">
    <div class="dept-head"><h2>${esc(title)}</h2><span class="dept-note">${esc(note)}</span>
      <span class="dept-total">${lines} line${lines === 1 ? '' : 's'}${
        opts.subtotal != null ? ` &middot; <b>${formatCurrency(opts.subtotal)}</b>` : ''
      }</span></div>
    ${groups.map(g => `
      <div class="loc-group">
        <div class="loc-head">${esc(g.label)} <span class="loc-count">${g.items.length} line${g.items.length === 1 ? '' : 's'}</span></div>
        <div class="grid">${g.items.map(i => itemPairHtml(i, today, byParent)).join('')}</div>
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
  // Shopping day, not order day — the whole point of the expired-sale flag is
  // that these two can differ by several days.
  const today = shoppingDay();
  const allStock = order.items.filter(i => i.item_type !== 'service');
  const byParent = subsByParent(allStock);
  // Substitutions nest under their OOS original (Freshop). Keep them out of the
  // walk-order grid so they don't float to a different aisle as orphan cards.
  // Orphans (parent missing) still print standalone so nothing is lost.
  const parentIds = new Set(allStock.map(i => i.id));
  const walkStock = allStock.filter(i => {
    if (!i.is_substitution || !i.substitutes_item_id) return true;
    return !parentIds.has(i.substitutes_item_id);
  });
  const services = order.items.filter(i => i.item_type === 'service' && i.service_type === 'other_pickup');

  // ── THREE SEPARATE JOBS, THREE SEPARATE BLOCKS ──
  // Dave, at the August demo: "we typically have somebody else work on the CODs,
  // somebody else works on the grocery list" — and the CODs get bagged and
  // labeled per person. Mixed into the walk order they were unfindable, so:
  //
  //   GROCERY — the boat's order, billed to the company monthly
  //   DECK    — company-billed but invoiced SEPARATELY (doesn't hit the boat's
  //             grocery allowance), so it's bagged and totalled on its own
  //   COD     — dead last, grouped by crew member, each person paying their own
  //
  // Each block carries its own subtotal, which is what makes keying two register
  // totals (grocery + deck) straightforward at the till.
  const grocery = walkStock.filter(i => i.paid_by !== 'deck' && i.paid_by !== 'cod');
  const deck    = walkStock.filter(i => i.paid_by === 'deck');
  const cod     = walkStock.filter(i => i.paid_by === 'cod');
  // Totals/counts still include nested substitution lines (billed) from allStock.
  const groceryAll = allStock.filter(i => i.paid_by !== 'deck' && i.paid_by !== 'cod');
  const deckAll    = allStock.filter(i => i.paid_by === 'deck');
  const codAll     = allStock.filter(i => i.paid_by === 'cod');

  // ── ONE WALK, IN THE ORDER THE MANAGER CONFIGURED ──
  // This used to pull Meat and Produce out into their own sections printed
  // AFTER everything else. That silently overrode Settings → Store Layout: a
  // manager who put Produce first still got it printed last, and the sheet no
  // longer matched the route a shopper actually walks. Dave, describing his own
  // sheet: "this is just going in order of the actual walking layout."
  //
  // So the grocery block is now a single continuous run and groupByWalkingOrder
  // places every department exactly where the configured zone order says. Meat
  // and Produce still print as their own labeled groups — they just appear at
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
  const grocerySubtotal = sumOf(groceryAll);
  const deckSubtotal = sumOf(deckAll);
  const codSubtotal = sumOf(codAll);

  // Freshop's header counts: distinct lines vs units in the basket.
  const uniqueItemCount = allStock.length;
  const totalItemCount = allStock.reduce((s, i) => s + (Number.isInteger(i.quantity) ? i.quantity : 1), 0);
  const totalLines = uniqueItemCount;
  const totalUnits = totalItemCount;
  const codCount = codAll.length;
  const weighCount = allStock.filter(isWeighable).length;
  const noBarcodeCount = allStock.filter(i => !isWeighable(i) && !normalizeUpcA(i.upc)).length;

  const placed = new Date(order.created_at);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Pick Sheet — ${esc(order.order_number)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 9.5px; padding: 8px; }
  /* LANDSCAPE. Dave: more barcodes across the page. Four cards per row —
     room for gun-readable codes + identifiable thumbs. moduleWidth 2. */
  @page { size: letter landscape; margin: 7.5mm; }
  @media print {
    body { padding: 0; }
    .bc, .bc svg { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }

  /* Dense layout — max scannable barcodes per page, minimal dead space */
  header.sheet { display: flex; justify-content: space-between; align-items: baseline;
                 border-bottom: 2px solid #000; padding-bottom: 2px; margin-bottom: 3px; }
  .brand b { font-size: 12px; color: #000; letter-spacing: .4px; }
  .brand span { font-size: 8.5px; color: #333; margin-left: 5px; }
  .ordmeta { text-align: right; font-size: 8.5px; line-height: 1.25; }
  .ordmeta .num { font-size: 11px; font-weight: bold; color: #000; margin-right: 5px; }

  .facts { display: flex; flex-wrap: wrap; gap: 1px 10px; background: #fff; border: 1px solid #000;
           border-radius: 2px; padding: 2px 6px; margin-bottom: 3px; font-size: 9px; }
  .facts b { color: #000; }
  .warn-sale { background:#fff !important; border-color:#000 !important; color:#000 !important; font-weight: 700; }
  .warn { background: #fff; border: 1.5px solid #000; border-radius: 2px; padding: 2px 6px; margin-bottom: 3px; font-size: 9px; font-weight: 700; }
  .notes { background: #fff; border: 1px solid #000; border-radius: 2px; padding: 2px 6px; margin-bottom: 3px; font-size: 9px; }

  /* No forced page-breaks — let the browser pack as many cards per page as fit.
     Meat & Seafood / Produce section headers are the department handoff cue. */
  .dept-head { display: flex; align-items: baseline; gap: 6px; background: #000; color: #fff;
               padding: 2px 6px; border-radius: 0; margin-top: 3px; }
  .dept-head h2 { font-size: 10px; text-transform: uppercase; letter-spacing: .8px; }
  .dept-note { font-size: 8px; color: #ddd; }

  .loc-head { background: #fff; border-left: 3px solid #000; border-bottom: 1px solid #000; font-weight: bold; font-size: 9px;
              padding: 1px 5px; margin-top: 2px; }
  .loc-count { font-weight: normal; color: #444; font-size: 8px; margin-left: 4px; }

  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; padding: 3px 0; }
  .item { border: 1px solid #000; border-radius: 0; padding: 3px 4px;
          break-inside: avoid; page-break-inside: avoid; background: #fff; }
  .item.cod { border: 2px solid #000; background: #fff; }
  .item.oos { opacity: .72; }
  .item.is-sub { border-style: dashed; }
  .item.nested { margin-top: 2px; border-left: 3px solid #000; }
  .pair { display: contents; }
  .line1 { display: flex; gap: 4px; align-items: center; }
  .qty { font-size: 13px; font-weight: 900; color: #000; white-space: nowrap; }
  .desc { font-weight: bold; font-size: 9.5px; line-height: 1.15; }
  .desc.struck { text-decoration: line-through; }
  .pref-note { color: #000; font-weight: 900; font-size: 7.5px; text-transform: uppercase;
               border: 1px solid #000; padding: 1px 3px; margin-top: 1px; }
  .sub { color: #222; font-size: 7.5px; }
  .cod-tag { color: #000; font-weight: 900; font-size: 7.5px; text-transform: uppercase; letter-spacing: .3px; }
  .deck-tag { color: #000; font-weight: 900; font-size: 7.5px; text-transform: uppercase; letter-spacing: .3px; }
  .sale { color: #000; font-weight: 800; }
  .sale s { color: #555; font-weight: 400; }
  .sale-dates { color: #000; font-weight: 400; font-size: 7px; }
  /* A lapsed sale must not read as a live one — strikethrough + bold callout. */
  .sale-dead { color: #333; text-decoration: line-through; }
  .sale-dead s { text-decoration: none; }
  .sale-expired {
    margin-top: 1px; padding: 1px 3px; font-size: 7px; line-height: 1.3;
    background: #fff; border: 1.5px solid #000; border-radius: 0; color: #000; font-weight: 700;
  }
  .sale-expired b { color: #000; }
  .sale-diff { font-weight: 800; }
  .sale-honor { display: inline-block; margin-left: 3px; font-weight: 800; white-space: nowrap; }

  /* ── Thumbnails ── big enough to read a package at arm's length. */
  .thumb { width: 38px; height: 38px; object-fit: contain; flex: 0 0 auto;
           border: 1px solid #000; border-radius: 0; background: #fff; margin-right: 3px; }
  .thumb-empty { display: inline-block; background: #e8e8e8; }

  /* ── Section tones ── a shopper holding three stapled blocks needs to know
     which one they're in without reading the header. */
  .dept-total { margin-left: auto; font-size: 8.5px; color: #fff; white-space: nowrap; font-weight: 700; }
  .counts { display: flex; gap: 14px; margin: 3px 0 1px; }
  .count-label { display: block; font-size: 8px; font-weight: 800; color: #000; line-height: 1.1; }
  .count-value { display: block; font-size: 10px; color: #000; margin-top: 1px; font-weight: 700; }
  /* Section tones stay black heads — grocery/deck/COD still separate blocks;
     labels in the header text carry the handoff cue without muddy toner fills. */
  .tone-deck  .dept-head { background: #000; }
  .tone-cod   .dept-head { background: #000; }
  .tone-deck  .dept-head h2::before { content: "DECK · "; }
  .tone-cod   .dept-head h2::before { content: "COD · "; }
  /* Deck and COD start on their own page — different people, different bags,
     different totals. Grocery flows continuously as before. */
  .newpage { page-break-before: always; break-before: page; }

  .cod-person { border: 2px solid #000; border-radius: 0; margin-top: 5px;
                break-inside: avoid; page-break-inside: avoid; }
  .cod-person-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
                     background: #fff; border-bottom: 2px solid #000; padding: 3px 6px; }
  .cod-name { font-size: 11px; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: 0.4px; }
  .cod-person-total { font-size: 9px; color: #000; font-weight: 700; }
  .cod-bag { margin-left: auto; font-size: 8.5px; color: #000; font-weight: 700; }
  .sub-tag { color: #000; font-weight: 900; font-size: 7.5px; }

  .scanrow { display: flex; align-items: center; gap: 5px; margin-top: 2px; }
  .bc svg { height: 42px; width: auto; display: block; }
  .bc svg rect[fill="#fff"], .bc svg rect:first-child { fill: #fff; }
  .scan { font-size: 7.5px; line-height: 1.05; color: #000; text-align: center; font-weight: 700; }
  .scan b { font-size: 11px; }
  .wgt { flex: 1; }
  .wgt-note { font-size: 7.5px; font-weight: 900; color: #000; }
  .wgt-line { font-size: 8px; margin-top: 1px; color: #000; }
  .upc-raw { font-family: monospace; font-size: 7.5px; color: #222; }
  .oos-note { font-size: 7.5px; font-weight: 900; color: #444; text-transform: uppercase; }
  .check { margin-left: auto; font-size: 12px; color: #000; }

  .svc { border: 1.5px solid #000; border-radius: 0; padding: 5px 7px; margin-top: 5px; font-size: 10px;
         break-inside: avoid; page-break-inside: avoid; }
  .svc-top { display: flex; align-items: flex-start; gap: 5px; }
  .svc b { font-size: 11px; line-height: 1.2; flex: 1; }
  .tick { width: 11px; height: 11px; border: 1.5px solid #000; border-radius: 0; flex: 0 0 auto; margin-top: 1px; }
  .cod-pill { background:#fff; color:#000; border:1.5px solid #000; font-weight:800;
              font-size:8.5px; padding:1px 5px; border-radius:0; white-space:nowrap; flex:0 0 auto; }
  .boat-pill { background:#fff; color:#000; border:1.5px solid #000; font-weight:800;
                  font-size:8.5px; padding:1px 5px; border-radius:0; white-space:nowrap; flex:0 0 auto; }
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
    ${order.arrival_date ? `<span><b>Arrival:</b> ${esc(order.arrival_date)}${order.arrival_time ? ` ${esc(formatArrivalTime(order.arrival_time))}` : ''}</span>` : ''}
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

  ${/* Lapsed sales, called out up front. Whoever rings this order needs to know
        BEFORE they start that there are judgement calls waiting on the sheet,
        not discover them one at a time at the register. */''}
  ${(() => {
    const lapsed = allStock.filter(i => saleLapsed(i, today));
    if (!lapsed.length) return '';
    const owed = lapsed.reduce(
      (s, i) => s + (Number(i.regular_price) - Number(i.unit_price)) * (Number(i.quantity) || 1), 0);
    return `<div class="warn warn-sale">
      &#9888; <b>${lapsed.length} sale price${lapsed.length === 1 ? '' : 's'} expired
      between ordering and today.</b> The boat was quoted the sale price; the register
      will ring the regular one — <b>${formatCurrency(owed)}</b> more in total.
      Each is marked on its line with a box to tick if you honour it.
    </div>`;
  })()}

  ${order.notes ? `<div class="notes"><b>Customer notes:</b> ${esc(order.notes)}</div>` : ''}

  ${sectionHtml(
    'Grocery',
    'Walk order — start here · boat allowance · billed monthly',
    groceryGroups,
    today,
    { subtotal: grocerySubtotal, tone: 'grocery', byParent },
  )}

  ${/* DECK — company-billed but invoiced separately, so it is bagged and rung
        on its own. Its own page: the boat wants to see the deck total apart
        from the grocery total, and that means a second register total. */''}
  ${sectionHtml(
    'Deck Supplies',
    'Bag & ring SEPARATELY — not part of the boat’s grocery allowance',
    deckGroups,
    today,
    { subtotal: deckSubtotal, tone: 'deck', newPage: true, byParent },
  )}

  ${/* COD — dead last, grouped by the person paying. Dave: "we typically have
        somebody else work on the CODs, somebody else works on the grocery
        list", and each person's items get bagged and labeled with their name.
        Mixed into the walk order these were effectively unfindable. */''}
  ${codByPerson.length ? `<section class="dept tone-cod newpage">
    <div class="dept-head"><h2>COD &mdash; collect from each crew member</h2>
      <span class="dept-note">Paid personally &middot; NEVER on the company invoice &middot; bag &amp; label per person</span>
      <span class="dept-total">${cod.length} line${cod.length === 1 ? '' : 's'} &middot; <b>${formatCurrency(codSubtotal)}</b></span></div>
    ${codByPerson.map(([name, list]) => {
      const withSubs = list.flatMap(i => [i, ...(byParent.get(i.id) || [])]);
      const personTotal = withSubs
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
          .map(i => itemPairHtml(i, today, byParent)).join('')}</div>
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
