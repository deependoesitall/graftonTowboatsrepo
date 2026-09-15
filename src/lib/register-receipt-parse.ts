// src/lib/register-receipt-parse.ts
//
// Sinclair's itemized REGISTER receipt (the rung tape), not the paper order form.
// Real lines look like:
//   Plu# 60069900328
//   JET PUF STD MARSHMAL             2.25 2 F
// or:
//   Plu# 1800085517
//   PILS SS BISCUIT
//       12 @       4.99 EA          59.88 1 F

import { ourKeys, norm } from '@/lib/freshop-sync';

export interface ReceiptRawLine {
  plu: string;
  description: string;
  qty: number;
  unitPrice: number | null;
  lineTotal: number | null;
  raw: string;
}

export interface CatalogRow {
  id: string;
  upc: string | null;
  description: string;
  price: number;
  /** Prefer active when several catalog rows share a UPC key. */
  is_active?: boolean | null;
  category?: string | null;
  pkg_size?: string | null;
  uom?: string | null;
  image_url?: string | null;
}

export interface MatchedReceiptLine {
  plu: string;
  description: string;
  qty: number;
  unitPrice: number | null;
  productId: string;
  catalogDescription: string;
  catalogPrice: number;
  category?: string | null;
  pkg_size?: string | null;
  uom?: string | null;
  image_url?: string | null;
  upc?: string | null;
}

export interface UnmatchedReceiptLine {
  plu: string;
  description: string;
  qty: number;
  unitPrice: number | null;
  reason: 'no_plu_match' | 'blank_plu';
}

/** Digits only; strip leading zeros — delegates to Freshop `norm` (one scheme). */
export function upcKey(s: string | null | undefined): string {
  return norm(s);
}

/** Phrase that may be printed letter-spaced: "D U P L I C A T E   R E C E I P T". */
function findSpacedPhrase(text: string, phrase: string): number {
  const pat = phrase
    .trim()
    .split(/\s+/)
    .map(word => word.split('').join('\\s*'))
    .join('\\s+');
  return text.search(new RegExp(pat, 'i'));
}

function countPluMarks(text: string): number {
  return (text.match(/Plu#\s*\d+/gi) || []).length;
}

/**
 * Sinclair tapes often append a full reprint. Cut on DUPLICATE RECEIPT,
 * RECALL TRANSACTION, or a second Plu# block after TAX-CODE.
 * Keep the segment with the MOST Plu# lines — the reprint is sometimes
 * first in the PDF, so "everything before the banner" would drop the order.
 */
export function stripDuplicateReceiptCopy(text: string): string {
  if (!text) return text;
  const cuts = [
    findSpacedPhrase(text, 'DUPLICATE RECEIPT'),
    findSpacedPhrase(text, 'RECALL TRANSACTION'),
    findSpacedPhrase(text, 'PLEASE KEEP FOR YOUR RECORDS'),
  ].filter(i => i >= 0);

  const totals = text.search(/\b(TAX[-\s]?CODE|BALANCE\s+DUE|IN\s+HOUSE\s+CHARGE)\b/i);
  if (totals >= 0) {
    const nextPlu = text.slice(totals).search(/\bPlu#\s*\d+/i);
    if (nextPlu >= 0) cuts.push(totals + nextPlu);
  }

  if (!cuts.length) return text;

  const bounds = [0, ...cuts.sort((a, b) => a - b), text.length];
  let best = text;
  let bestCount = -1;
  for (let i = 0; i < bounds.length - 1; i++) {
    const slice = text.slice(bounds[i], bounds[i + 1]).trim();
    const n = countPluMarks(slice);
    if (n > bestCount) {
      bestCount = n;
      best = slice;
    }
  }
  return bestCount > 0 ? best : text;
}

const DEPT_HEADER = /^(BAKERY|CANDY|COLD DELI|DAIRY|DRUGS|FROZEN FOOD|FRZ MT\/F|GEN MDSE|GROCERY|MEATS|PRODUCE|MANUAL WEIGHT|HBA|MEAT|SEAFOOD|FROZEN|HBC)$/i;
const FOOTER_LINE = /^(TAX|SUBTOTAL|TOTAL|BALANCE|CHANGE|FOOD TAX|NON FOOD|CASHIER|ACCOUNT|SIGNATURE|PHONE NUMBER|POINTS|IN HOUSE)/i;

/**
 * Parse extracted receipt text into aggregated PLU lines.
 * Duplicate PLUs (each ring is qty 1 on Sinclair tapes) are summed.
 * Pack lines (`12 @ 4.99 EA 59.88`) and catch-weight (`2.60 lb @ 0.74/lb`)
 * override the qty=1 on the description row.
 */
export function parseRegisterReceiptText(text: string): ReceiptRawLine[] {
  const lines = stripDuplicateReceiptCopy(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const raw: ReceiptRawLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const pluHit = lines[i].match(/^Plu#\s*(\d+)(?:\s+(.*))?$/i);
    if (!pluHit) continue;
    const plu = pluHit[1];
    const sameLineRest = (pluHit[2] || '').trim();
    const block: string[] = [];
    if (sameLineRest) block.push(sameLineRest);

    let j = i + 1;
    while (j < lines.length) {
      const nxt = lines[j];
      if (/^Plu#\s*\d+/i.test(nxt)) break;
      if (DEPT_HEADER.test(nxt) && !priceTail(nxt)) break;
      if (FOOTER_LINE.test(nxt) && !priceTail(nxt)) break;
      block.push(nxt);
      j++;
      if (block.length > 6) break;
    }
    i = j - 1;

    raw.push(parseItemBlock(plu, block, [lines[i], ...block].join('\n')));
  }

  // Catch-weight meat / random-weight lines with a price but no Plu#
  // (e.g. "MEATS 107.97 1 F" or "2 @ 6.99  13.98 1 F" under a MEATS header).
  let deptCtx = '';
  for (let i = 0; i < lines.length; i++) {
    if (/^Plu#\s*\d+/i.test(lines[i])) { deptCtx = ''; continue; }
    if (DEPT_HEADER.test(lines[i]) && !priceTail(lines[i])) {
      deptCtx = lines[i].toUpperCase();
      continue;
    }
    if (FOOTER_LINE.test(lines[i]) && !priceTail(lines[i])) { deptCtx = ''; continue; }
    const prev = lines[i - 1] || '';
    if (/^Plu#\s*\d+/i.test(prev)) continue;

    const pack = lines[i].match(/^(\d+)\s*@\s+([\d.]+)(?:\s*EA)?\s+(\d+\.\d{2})/i);
    if (pack && /^(MEATS|MEAT|SEAFOOD|PRODUCE)$/i.test(deptCtx)) {
      raw.push({
        plu: '',
        description: deptCtx,
        qty: parseInt(pack[1], 10) || 1,
        unitPrice: parseFloat(pack[2]),
        lineTotal: parseFloat(pack[3]),
        raw: lines[i],
      });
      continue;
    }
    const priced = parseDescPriceQty(lines[i]);
    if (!priced || priced.unitPrice == null) continue;
    const desc = priced.description.replace(/\s+W\s*$/i, '').trim();
    if (/^(MEATS|MEAT|SEAFOOD|PRODUCE)$/i.test(desc) || /^(MEATS|MEAT|SEAFOOD|PRODUCE)$/i.test(deptCtx) && priced.unitPrice >= 1) {
      raw.push({
        plu: '',
        description: /^(MEATS|MEAT|SEAFOOD|PRODUCE)$/i.test(desc) ? desc : deptCtx,
        qty: priced.qty,
        unitPrice: priced.unitPrice,
        lineTotal: priced.lineTotal,
        raw: lines[i],
      });
    }
  }

  const byPlu = new Map<string, ReceiptRawLine>();
  let orphan = 0;
  for (const row of raw) {
    const key = row.plu ? (upcKey(row.plu) || row.plu) : `writein-${++orphan}-${row.description}`;
    const prev = byPlu.get(key);
    if (!prev) {
      byPlu.set(key, { ...row });
    } else {
      prev.qty += row.qty;
      const add = row.lineTotal ?? ((row.unitPrice || 0) * row.qty);
      prev.lineTotal = (prev.lineTotal ?? ((prev.unitPrice || 0) * (prev.qty - row.qty))) + add;
      if (prev.qty > 0 && prev.lineTotal != null) prev.unitPrice = prev.lineTotal / prev.qty;
    }
  }
  return Array.from(byPlu.values());
}

function priceTail(line: string): boolean {
  return /\d+\.\d{2}\s+\d+(?:\.\d+)?\s*[A-Z]?\s*$/.test(line);
}

function parseItemBlock(plu: string, block: string[], rawBlock: string): ReceiptRawLine {
  let description = '';
  let qty = 1;
  let unitPrice: number | null = null;
  let lineTotal: number | null = null;
  let haveExtension = false;

  for (const line of block) {
    const pack = line.match(/^(\d+)\s*@\s+([\d.]+)(?:\s*EA)?\s+(\d+\.\d{2})/i);
    if (pack) {
      qty = parseInt(pack[1], 10) || 1;
      unitPrice = parseFloat(pack[2]);
      lineTotal = parseFloat(pack[3]);
      haveExtension = true;
      continue;
    }
    const twoFor = line.match(/^(\d+)\s*@\s+2\s+FOR\s+([\d.]+)\s+(\d+\.\d{2})/i);
    if (twoFor) {
      qty = parseInt(twoFor[1], 10) || 1;
      lineTotal = parseFloat(twoFor[3]);
      unitPrice = qty ? lineTotal / qty : parseFloat(twoFor[2]);
      haveExtension = true;
      continue;
    }
    const wt = line.match(/^([\d.]+)\s*lb\s*@\s*([\d.]+)\s*\/?\s*lb\s+(\d+\.\d{2})/i);
    if (wt) {
      qty = parseFloat(wt[1]) || 1;
      unitPrice = parseFloat(wt[2]);
      lineTotal = parseFloat(wt[3]);
      haveExtension = true;
      continue;
    }
    const priced = parseDescPriceQty(line);
    if (priced && priced.unitPrice != null) {
      const name = priced.description.replace(/\s+W\s*$/i, '').trim();
      if (name && !DEPT_HEADER.test(name)) description = description || name;
      else if (name) description = description || name;
      if (!haveExtension) {
        qty = priced.qty;
        unitPrice = priced.unitPrice;
        lineTotal = priced.lineTotal;
      }
      continue;
    }
    const cleaned = line.replace(/\s+W\s*$/i, '').trim();
    if (cleaned && !DEPT_HEADER.test(cleaned) && !FOOTER_LINE.test(cleaned)) {
      description = description || cleaned;
    }
  }

  return {
    plu,
    description: description || (plu ? `PLU ${plu}` : 'Write-in'),
    qty: qty > 0 ? qty : 1,
    unitPrice,
    lineTotal,
    raw: rawBlock,
  };
}

function parseDescPriceQty(line: string): {
  description: string;
  qty: number;
  unitPrice: number | null;
  lineTotal: number | null;
} | null {
  if (!line) return null;
  // DESC ........ 2.25 2 F   — F (food stamp) is optional (drugs / HBA omit it)
  const m = line.match(/^(.*?)\s+(\d+\.\d{2})\s+(\d+)(?:\s+[A-Z])?\s*$/i);
  if (m) {
    const unitPrice = parseFloat(m[2]);
    const qty = parseInt(m[3], 10) || 1;
    return {
      description: m[1].replace(/\s+W\s*$/i, '').trim(),
      qty,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
      lineTotal: Number.isFinite(unitPrice) ? unitPrice * qty : null,
    };
  }
  return { description: line.trim(), qty: 1, unitPrice: null, lineTotal: null };
}

export function matchReceiptToCatalog(lines: ReceiptRawLine[], catalog: CatalogRow[]): {
  matched: MatchedReceiptLine[];
  needsYou: UnmatchedReceiptLine[];
} {
  // Same key variants as Freshop sync (`ourKeys` / `norm`) — UPC-A check-digit
  // tolerance for len>=8; short PLUs stay exact. Prefer an active row on collide.
  const byUpc = new Map<string, CatalogRow>();
  for (const c of catalog) {
    for (const k of ourKeys(c.upc || '')) {
      const existing = byUpc.get(k);
      if (!existing) {
        byUpc.set(k, c);
      } else if (c.is_active && existing.is_active === false) {
        byUpc.set(k, c);
      }
    }
  }

  const matched: MatchedReceiptLine[] = [];
  const needsYou: UnmatchedReceiptLine[] = [];

  for (const line of lines) {
    const keys = [
      ...ourKeys(line.plu),
      ...(line.plu && line.plu.length < 12 ? ourKeys(line.plu.padStart(12, '0')) : []),
    ];
    let hit: CatalogRow | undefined;
    for (const k of keys) {
      hit = byUpc.get(k);
      if (hit) break;
    }
    if (hit) {
      matched.push({
        plu: line.plu,
        description: line.description,
        qty: line.qty,
        unitPrice: line.unitPrice ?? hit.price,
        productId: hit.id,
        catalogDescription: hit.description,
        catalogPrice: hit.price,
        category: hit.category ?? null,
        pkg_size: hit.pkg_size ?? null,
        uom: hit.uom ?? null,
        image_url: hit.image_url ?? null,
        upc: hit.upc ?? null,
      });
    } else {
      needsYou.push({
        plu: line.plu,
        description: line.description,
        qty: line.qty,
        unitPrice: line.unitPrice,
        reason: keys.length ? 'no_plu_match' : 'blank_plu',
      });
    }
  }
  return { matched, needsYou };
}

/** Pull a few header fields when present on the tape. */

const MONTHS: Record<string, string> = {
  JAN: 'Jan', FEB: 'Feb', MAR: 'Mar', APR: 'Apr', MAY: 'May', JUN: 'Jun',
  JUL: 'Jul', AUG: 'Aug', SEP: 'Sep', OCT: 'Oct', NOV: 'Nov', DEC: 'Dec',
};

const MONTH_NUM: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

/** ISO date (YYYY-MM-DD) for orders.purchased_at. */
export function receiptDateToIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})([A-Za-z]{3})(\d{4})$/);
  if (m) {
    const mm = MONTH_NUM[m[2].toUpperCase()];
    if (!mm) return null;
    return `${m[3]}-${mm}-${String(parseInt(m[1], 10)).padStart(2, '0')}`;
  }
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    const month = parseInt(dmy[1], 10);
    const day = parseInt(dmy[2], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

/** Turn tape dates like 11SEP2026 into Sep 11, 2026. */
export function formatReceiptDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})([A-Za-z]{3})(\d{4})$/);
  if (m) {
    const day = String(parseInt(m[1], 10));
    const mon = MONTHS[m[2].toUpperCase()] || m[2];
    return `${mon} ${day}, ${m[3]}`;
  }
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mi = parseInt(dmy[1], 10) - 1;
    const mon = months[mi] || dmy[1];
    return `${mon} ${parseInt(dmy[2], 10)}, ${year}`;
  }
  return s;
}

export function parseReceiptMeta(text: string): {
  vesselHint: string | null;
  amount: number | null;
  dateHint: string | null;
} {
  // Header/footer (amount, date, boat) can sit on the charge slip, which is
  // a different segment than the item list after reprint-stripping.
  const amountM = text.match(/A\s*m\s*o\s*u\s*n\s*t\s*:\s*([\d\s,.]+)/i)
    || text.match(/\$\s*([\d,]+\.\d{2})/);
  let amount: number | null = null;
  if (amountM) {
    const n = parseFloat(amountM[1].replace(/[^\d.]/g, ''));
    if (Number.isFinite(n)) amount = n;
  }
  const dateM = text.match(/(\d{1,2}(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{4}|\d{1,2}\.\d{1,2}\.\d{2,4})/i);
  // Vessel often appears near SCOTT NOBLE on the charge header — take a nearby ALLCAPS name line
  let vesselHint: string | null = null;
  const vesselM = text.match(/\b(SCOTT NOBLE|W\.?\s*SCOTT NOBLE)\b/i);
  if (vesselM) vesselHint = vesselM[1].replace(/\s+/g, ' ').trim();

  return { vesselHint, amount, dateHint: dateM?.[1] || null };
}
