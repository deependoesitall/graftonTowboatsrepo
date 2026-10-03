// src/lib/marine-order-csv.ts
// Sinclair marine order-form CSV.
// Sinclair price is the named price column (the first dollar amount).
// The last column is the empty order total and is never the product price.

import { normalizeCategory } from './utils';
import { upcFromCell, type BargeSheetRow } from './import-rows';

export type MarineOrderProduct = BargeSheetRow;

export function isMarineOrderCsv(text: string): boolean {
  return parseCsv(stripBom(text)).some(row => isHeader(row));
}

export interface MarineOrderParse {
  products: MarineOrderProduct[];
  /** Non-blank rows before COD ORDERS that are not products: banners, notes, write-ins. */
  skippedBanners: number;
}

export function parseMarineOrderCsv(text: string): MarineOrderParse {
  const rows = parseCsv(stripBom(text));
  const headerIdx = rows.findIndex(isHeader);
  if (headerIdx < 0) throw new Error('This file is not a Sinclair order form.');

  const header = rows[headerIdx];
  const priceIdx = header.findIndex(cell => /sinclair\s*price/i.test(cell || ''));
  const uomIdx = header.findIndex(cell => (cell || '').trim().toLowerCase() === 'uom');
  const priceCol = priceIdx >= 0 ? priceIdx : 6;
  const uomCol = uomIdx >= 0 ? uomIdx : 5;

  const products: MarineOrderProduct[] = [];
  let categoryCarry = '';
  let skippedBanners = 0;

  for (const row of rows.slice(headerIdx + 1)) {
    if (row.some(cell => /COD\s+ORDERS/i.test(cell || ''))) break;

    const rawCategory = collapse(row[0] || '');
    if (rawCategory) categoryCarry = rawCategory;

    const price = parseDollar(row[priceCol] || '');
    const description = collapse(row[2] || '').toUpperCase();
    const priced = price != null && price > 0;
    const banned = !description || /^\d+$/.test(description) || description === 'COD' || description.includes('WRITE IN') || description.includes('CARD');
    if (!priced || banned) {
      if (row.some(cell => (cell || '').trim() !== '')) skippedBanners++;
      continue;
    }

    const category = categoryCarry || 'General';
    const pack = collapse(row[3] || '').toUpperCase();
    const uom = collapse(row[uomCol] || '').toUpperCase();

    products.push({
      category: normalizeCategory(category),
      sub_category: category,
      upc: upcFromCell(row[1] || ''),
      description,
      pkg_size: pack || null,
      uom: uom || null,
      price,
      is_active: true,
    });
  }

  return { products, skippedBanners };
}

function isHeader(row: string[]): boolean {
  return (row[0] || '').trim().toLowerCase() === 'category'
    && (row[1] || '').trim().toLowerCase() === 'upc'
    && (row[2] || '').trim().toLowerCase() === 'item description'
    && (row[3] || '').trim().toLowerCase() === 'pkg size';
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function parseDollar(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const match = text.match(/^\$?\s*([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)(\.[0-9]{1,2})?$/);
  if (!match) return null;
  const amount = Number((match[1] + (match[2] || '')).replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  const source = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}