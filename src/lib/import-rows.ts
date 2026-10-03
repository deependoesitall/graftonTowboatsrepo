// src/lib/import-rows.ts
// Dedupe, shared-barcode flags, and barge-list match plan.
// Matching is pure: callers load the database and apply the plan.
// Nothing in this file writes.

export interface BargeSheetRow {
  category: string;
  sub_category: string;
  upc: string | null;
  description: string;
  pkg_size: string | null;
  uom: string | null;
  price: number;
  is_active?: boolean;
  /** 1-based order on the order form, filled in after dedupe. */
  form_seq?: number;
}

export interface BargeDbRow {
  id: string;
  upc: string | null;
  description: string | null;
  pkg_size: string | null;
  price: number | string | null;
  is_active: boolean;
  store_only: boolean;
}

export interface SharedBarcodeGroup {
  upc: string;
  items: { description: string; pkg_size: string | null; price: number }[];
}

export interface BargePreviewRow {
  status: 'add' | 'update' | 'remove';
  description: string;
  pkg_size: string | null;
  price: number;
  category: string;
  upc: string | null;
}

export interface BargeReplacePlan {
  kept: BargeSheetRow[];
  droppedDuplicates: number;
  sharedBarcodes: SharedBarcodeGroup[];
  added: BargeSheetRow[];
  updated: { id: string; row: BargeSheetRow }[];
  removedIds: string[];
  preview: BargePreviewRow[];
}

/** Trim, uppercase, collapse whitespace. Size words stay in the name. */
export function normalizeDescription(value: string | null | undefined): string {
  return (value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Trim, uppercase, collapse whitespace. Internal spaces stay ("5 #", "1/2 GAL"). */
export function normalizePack(value: string | null | undefined): string {
  return (value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Digit-normalized barcode for grouping and matching.
 * Strips non-digits and leading zeros. Empty is not a barcode.
 */
export function digitUpc(value: string | null | undefined): string | null {
  const digits = (value || '').replace(/\D/g, '').replace(/^0+/, '');
  return digits || null;
}

/** A UPC is a 4–14 digit token. LARGE / FAMOUS / FRESH BAKED / BAKERY are not. */
export function upcFromCell(raw: string | null | undefined): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  if (!/^[\d\s-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 14) return null;
  return digits;
}

function money(value: number | string | null | undefined): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100) / 100;
}

/** Drop rows that must never become products, and blank out non-UPC tokens. */
export function sanitizeBargeRows(rows: BargeSheetRow[]): BargeSheetRow[] {
  const out: BargeSheetRow[] = [];
  for (const row of rows) {
    const description = normalizeDescription(row.description);
    const price = money(row.price);
    if (!description || !Number.isFinite(price) || price <= 0) continue;
    if (/^\d+$/.test(description)) continue;
    if (description === 'COD') continue;
    if (description.includes('WRITE IN')) continue;
    if (description.includes('CARD')) continue;
    const pack = normalizePack(row.pkg_size);
    const uom = normalizePack(row.uom);
    out.push({
      category: (row.category || 'General').trim() || 'General',
      sub_category: normalizeDescription(row.sub_category) ? (row.sub_category || '').trim().replace(/\s+/g, ' ') : (row.category || 'General'),
      upc: upcFromCell(row.upc),
      description,
      pkg_size: pack || null,
      uom: uom || null,
      price,
      is_active: true,
    });
  }
  return out;
}

export function dedupeBargeRows(rows: BargeSheetRow[]): { kept: BargeSheetRow[]; dropped: number } {
  const seen = new Set<string>();
  const kept: BargeSheetRow[] = [];
  let dropped = 0;
  for (const row of sanitizeBargeRows(rows)) {
    const key = `${row.description}|${row.pkg_size || ''}|${row.price.toFixed(2)}`;
    if (seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);
    kept.push({ ...row, form_seq: kept.length + 1 });
  }
  return { kept, dropped };
}

export function sharedBarcodeGroups(rows: BargeSheetRow[]): SharedBarcodeGroup[] {
  const map = new Map<string, BargeSheetRow[]>();
  for (const row of rows) {
    const key = digitUpc(row.upc);
    if (!key) continue;
    const arr = map.get(key);
    if (arr) arr.push(row);
    else map.set(key, [row]);
  }
  const groups: SharedBarcodeGroup[] = [];
  for (const [upc, items] of map) {
    if (items.length < 2) continue;
    groups.push({
      upc: items[0].upc || upc,
      items: items.map(item => ({
        description: item.description,
        pkg_size: item.pkg_size,
        price: item.price,
      })),
    });
  }
  groups.sort((a, b) => a.upc.localeCompare(b.upc));
  return groups;
}

function descPackKey(description: string | null | undefined, pkg: string | null | undefined): string {
  return `${normalizeDescription(description)}|${normalizePack(pkg)}`;
}

/**
 * Match barge products (store_only false) to a parsed sheet.
 * UPC is the key only when that barcode is one description and one size on
 * the sheet AND exactly one barge product has it. Otherwise description + pack.
 * A price change updates the matched row. It does not insert a second product.
 * Active barge rows that are not matched are the removed set. Inactive rows
 * that are absent are not removed. Store-only rows are ignored.
 */
export function planBargeReplace(input: BargeSheetRow[], db: BargeDbRow[]): BargeReplacePlan {
  const { kept, dropped } = dedupeBargeRows(input);
  const sharedBarcodes = sharedBarcodeGroups(kept);
  const barge = db.filter(row => row.store_only === false);

  const sheetByUpc = new Map<string, BargeSheetRow[]>();
  for (const row of kept) {
    const key = digitUpc(row.upc);
    if (!key) continue;
    const arr = sheetByUpc.get(key);
    if (arr) arr.push(row);
    else sheetByUpc.set(key, [row]);
  }

  const dbByUpc = new Map<string, BargeDbRow[]>();
  const dbByDesc = new Map<string, BargeDbRow[]>();
  for (const row of barge) {
    const upcKey = digitUpc(row.upc);
    if (upcKey) {
      const arr = dbByUpc.get(upcKey);
      if (arr) arr.push(row);
      else dbByUpc.set(upcKey, [row]);
    }
    const dkey = descPackKey(row.description, row.pkg_size);
    const descArr = dbByDesc.get(dkey);
    if (descArr) descArr.push(row);
    else dbByDesc.set(dkey, [row]);
  }

  const claimed = new Set<string>();
  const added: BargeSheetRow[] = [];
  const updated: { id: string; row: BargeSheetRow }[] = [];

  const take = (candidates: BargeDbRow[] | undefined): BargeDbRow | null => {
    if (!candidates) return null;
    const free = candidates.filter(row => !claimed.has(row.id));
    if (!free.length) return null;
    free.sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.id.localeCompare(b.id));
    return free[0];
  };

  for (const row of kept) {
    const upcKey = digitUpc(row.upc);
    let match: BargeDbRow | null = null;
    if (upcKey && sheetByUpc.get(upcKey)?.length === 1 && dbByUpc.get(upcKey)?.length === 1) {
      match = take(dbByUpc.get(upcKey));
    }
    if (!match) match = take(dbByDesc.get(descPackKey(row.description, row.pkg_size)));
    if (match) {
      claimed.add(match.id);
      updated.push({ id: match.id, row });
    } else {
      added.push(row);
    }
  }

  const removed = barge.filter(row => row.is_active && !claimed.has(row.id));
  const preview: BargePreviewRow[] = [
    ...added.map(row => ({
      status: 'add' as const,
      description: row.description,
      pkg_size: row.pkg_size,
      price: row.price,
      category: row.category,
      upc: row.upc,
    })),
    ...updated.map(({ row }) => ({
      status: 'update' as const,
      description: row.description,
      pkg_size: row.pkg_size,
      price: row.price,
      category: row.category,
      upc: row.upc,
    })),
    ...removed.map(row => ({
      status: 'remove' as const,
      description: row.description || '',
      pkg_size: row.pkg_size,
      price: money(row.price) || 0,
      category: '',
      upc: upcFromCell(row.upc),
    })),
  ];

  return {
    kept,
    droppedDuplicates: dropped,
    sharedBarcodes,
    added,
    updated,
    removedIds: removed.map(row => row.id),
    preview,
  };
}