// src/lib/freshop-sync.ts
// Server-side Freshop → catalog field mapping for the nightly sync cron.
//
// ⚠ MIRRORS src/components/admin/EnrichFromSinclair.tsx — the manual in-browser
// enrich and this nightly sync MUST compute identical updates. If you change a
// mapper or the field rules there, change them here too (and vice versa).
//
// The nightly sync always runs in FILL-MISSING mode for cosmetic fields
// (details, image) and ALWAYS-SYNC mode for operational fields (price,
// location, walkpath seq, quantity rules, freshop_id) — same defaults as the
// manual enrich with the Overwrite toggle off.

export const FRESHOP_APP_KEY = 'sinclair';
export const FRESHOP_STORE_ID = '4297';
export const FRESHOP_PAGE_SIZE = 100;
const IMAGE_BASE = 'https://images.freshop.ncrcloud.com';

export interface FreshopProduct {
  id?: string | number;
  upc?: string;
  barcode_upc_a?: string;
  barcode_ean13?: string;
  name?: string;
  size?: string;
  cover_image?: string;
  is_weight_required?: boolean;
  location?: string;
  shopper_location?: string;
  fulfillment_walkpath?: { name?: string; sequence?: number };
  base_price?: number;
  unit_price?: number;
  quantity_step?: number;
  quantity_label?: string;
  quantity_size_ratio?: number;
}

export interface SyncableProduct {
  id: string;
  upc: string | null;
  details: string | null;
  image_url: string | null;
  billed_by_weight: boolean;
  location: string | null;
  location_seq: number | null;
  price: number;
  quantity_step: number | null;
  quantity_label: string | null;
  quantity_size_ratio: number | null;
  freshop_id: string | null;
}

// ── UPC normalization (identical to the client enrich) ──
export function norm(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim().replace(/\.0+$/, '');
  return s.replace(/\D/g, '').replace(/^0+/, '');
}
export function freshopKeys(p: FreshopProduct): string[] {
  const keys = new Set<string>();
  for (const raw of [p.upc, p.barcode_upc_a, p.barcode_ean13]) {
    const n = norm(raw);
    if (n.length >= 4) keys.add(n);
  }
  const upcA = norm(p.barcode_upc_a);
  if (upcA.length >= 5) keys.add(upcA.slice(0, -1));
  return Array.from(keys);
}
export function ourKeys(upc: string): string[] {
  const n = norm(upc);
  if (n.length < 4) return [];
  const keys = [n];
  if (n.length >= 5) keys.push(n.slice(0, -1));
  return keys;
}

// ── Field mappers (identical to the client enrich) ──
function stripZzz(s: string): string {
  return s.replace(/\s*\(?\d+(\.\d+)?\s*zzz\)?/gi, '').trim();
}
function detailsFrom(p: FreshopProduct): string | null {
  const name = stripZzz((p.name || '').trim());
  if (!name) return null;
  const size = stripZzz((p.size || '').trim());
  if (size && !name.toLowerCase().includes(size.toLowerCase())) return `${name} (${size})`;
  return name;
}
function imageFrom(p: FreshopProduct): string | null {
  return p.cover_image ? `${IMAGE_BASE}/${p.cover_image}_large.png` : null;
}
function locationFrom(p: FreshopProduct): string | null {
  const raw = (p.shopper_location || p.location || p.fulfillment_walkpath?.name || '').trim();
  const cleaned = raw.replace(/\s*\/+\s*$/, '').trim();
  return cleaned || null;
}
function locationSeqFrom(p: FreshopProduct): number | null {
  const seq = p.fulfillment_walkpath?.sequence;
  return typeof seq === 'number' && isFinite(seq) ? seq : null;
}
function priceFrom(p: FreshopProduct): number | null {
  const raw = p.base_price ?? p.unit_price;
  if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) return null;
  return Math.round(raw * 100) / 100;
}

export interface SyncStats {
  matched: number; images: number; details: number;
  weightFlags: number; locations: number; prices: number;
}

/**
 * Field-update rules — EXACT mirror of the client enrich apply pass
 * (fill-missing for cosmetic fields; always-sync for operational fields).
 * Returns null when nothing needs updating for this product.
 */
export function computeFields(
  product: SyncableProduct,
  hit: FreshopProduct,
  stats: SyncStats,
): Record<string, unknown> | null {
  const fields: Record<string, unknown> = {};
  const newDetails = detailsFrom(hit);
  const newImage = imageFrom(hit);
  if (newDetails && !product.details && newDetails !== product.details) { fields.details = newDetails; stats.details++; }
  if (newImage && !product.image_url && newImage !== product.image_url) { fields.image_url = newImage; stats.images++; }
  if (hit.is_weight_required && !product.billed_by_weight) { fields.billed_by_weight = true; stats.weightFlags++; }
  const newLocation = locationFrom(hit);
  const newSeq = locationSeqFrom(hit);
  if (newLocation && (newLocation !== product.location || newSeq !== product.location_seq)) {
    fields.location = newLocation;
    fields.location_seq = newSeq;
    stats.locations++;
  }
  const newPrice = priceFrom(hit);
  if (newPrice != null && Math.abs(newPrice - Number(product.price)) >= 0.005) {
    fields.price = newPrice;
    stats.prices++;
  }
  const newStep = typeof hit.quantity_step === 'number' && isFinite(hit.quantity_step) && hit.quantity_step > 0 ? hit.quantity_step : null;
  const newLabel = stripZzz((hit.quantity_label || '').trim()) || null;
  const newRatio = typeof hit.quantity_size_ratio === 'number' && isFinite(hit.quantity_size_ratio) && hit.quantity_size_ratio > 0 ? hit.quantity_size_ratio : null;
  if (newStep !== product.quantity_step || newLabel !== product.quantity_label || newRatio !== product.quantity_size_ratio) {
    fields.quantity_step = newStep;
    fields.quantity_label = newLabel;
    fields.quantity_size_ratio = newRatio;
  }
  const newFreshopId = hit.id != null ? String(hit.id) : null;
  if (newFreshopId && newFreshopId !== product.freshop_id) {
    fields.freshop_id = newFreshopId;
  }
  return Object.keys(fields).length ? fields : null;
}

/** One Freshop catalog page (server-side). Returns null on rate limit/error. */
export async function fetchFreshopPage(skip: number): Promise<FreshopProduct[] | null> {
  try {
    const res = await fetch(
      `https://api.freshop.ncrcloud.com/1/products?app_key=${FRESHOP_APP_KEY}&store_id=${FRESHOP_STORE_ID}&limit=${FRESHOP_PAGE_SIZE}&skip=${skip}&sort=name&name_sort=asc`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.items) ? (data.items as FreshopProduct[]) : null;
  } catch {
    return null;
  }
}

/** Catalog size (total item count) — null when Freshop won't answer. */
export async function fetchFreshopTotal(): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.freshop.ncrcloud.com/1/products?app_key=${FRESHOP_APP_KEY}&store_id=${FRESHOP_STORE_ID}&limit=1`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.total === 'number' && data.total > 0 ? data.total : null;
  } catch {
    return null;
  }
}
