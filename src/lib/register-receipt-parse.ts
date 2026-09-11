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
}

export interface MatchedReceiptLine {
  plu: string;
  description: string;
  qty: number;
  unitPrice: number | null;
  productId: string;
  catalogDescription: string;
  catalogPrice: number;
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

/**
 * Parse extracted receipt text into aggregated PLU lines.
 * Duplicate PLUs (each ring is qty 1 on Sinclair tapes) are summed.
 */
export function parseRegisterReceiptText(text: string): ReceiptRawLine[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const raw: ReceiptRawLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^Plu#\s*(\d+)\s*$/i);
    if (!m) continue;
    const plu = m[1];
    // Description is usually the next line; qty/price may be on that line or the one after.
    const descLine = lines[i + 1] || '';
    const maybeMore = lines[i + 2] || '';

    let description = '';
    let qty = 1;
    let unitPrice: number | null = null;
    let lineTotal: number | null = null;
    let rawBlock = lines[i];

    const packed = parseDescPriceQty(descLine);
    if (packed && packed.description) {
      description = packed.description;
      qty = packed.qty;
      unitPrice = packed.unitPrice;
      lineTotal = packed.lineTotal;
      rawBlock += '\n' + descLine;
      i += 1;
    } else {
      description = descLine.replace(/\s+\d[\d.,]*\s+\d+\s+[A-Z]\s*$/i, '').trim() || descLine;
      rawBlock += '\n' + descLine;
      i += 1;
      const multi = maybeMore.match(/^(\d+)\s*@\s*([\d.]+)\s*EA\s+([\d.]+)/i);
      if (multi) {
        qty = parseInt(multi[1], 10) || 1;
        unitPrice = parseFloat(multi[2]) || null;
        lineTotal = parseFloat(multi[3]) || null;
        rawBlock += '\n' + maybeMore;
        i += 1;
      } else {
        const fallback = parseDescPriceQty(maybeMore);
        if (fallback && !fallback.description) {
          qty = fallback.qty;
          unitPrice = fallback.unitPrice;
          lineTotal = fallback.lineTotal;
          rawBlock += '\n' + maybeMore;
          i += 1;
        }
      }
    }

    raw.push({
      plu,
      description: description || `PLU ${plu}`,
      qty: qty > 0 ? qty : 1,
      unitPrice,
      lineTotal,
      raw: rawBlock,
    });
  }

  // Aggregate duplicate PLUs
  const byPlu = new Map<string, ReceiptRawLine>();
  for (const row of raw) {
    const key = upcKey(row.plu) || row.plu;
    const prev = byPlu.get(key);
    if (!prev) {
      byPlu.set(key, { ...row });
    } else {
      prev.qty += row.qty;
      if (prev.lineTotal != null && row.lineTotal != null) prev.lineTotal += row.lineTotal;
      else if (row.lineTotal != null) prev.lineTotal = row.lineTotal;
      if (prev.unitPrice == null && row.unitPrice != null) prev.unitPrice = row.unitPrice;
    }
  }
  return Array.from(byPlu.values());
}

function parseDescPriceQty(line: string): {
  description: string;
  qty: number;
  unitPrice: number | null;
  lineTotal: number | null;
} | null {
  if (!line) return null;
  // DESC ........ 2.25 2 F   (unit price, qty, food stamp flag)
  const m = line.match(/^(.*?)\s+([\d.]+)\s+(\d+)\s+[A-Z]\s*$/i);
  if (m) {
    const unitPrice = parseFloat(m[2]);
    const qty = parseInt(m[3], 10) || 1;
    return {
      description: m[1].trim(),
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
    const keys = ourKeys(line.plu);
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
