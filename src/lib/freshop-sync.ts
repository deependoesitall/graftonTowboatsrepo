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

// Freshop's catalog ballooned to ~71,600 rows (the AWG warehouse superset).
// The BROWSABLE store is the storefront department tree — ~20,700 items
// (probed live July 19, 2026). Scoping every catalog request to this root
// keeps the nightly sweep at ~208 pages instead of ~717 and keeps warehouse
// junk out of the import.
export const FRESHOP_STOREFRONT_ROOT = '21585437';

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
  /** e.g. "https://shop.sinclairsfoods.com/shop/produce/fresh_fruit/.../p/12413" — dept path drives category + alcohol exclusion */
  canonical_url?: string;
  department_ids?: string[];
  status?: string;
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

/** One Freshop catalog page, scoped to the browsable storefront tree. Null on rate limit/error. */
export async function fetchFreshopPage(skip: number): Promise<FreshopProduct[] | null> {
  try {
    const res = await fetch(
      `https://api.freshop.ncrcloud.com/1/products?app_key=${FRESHOP_APP_KEY}&store_id=${FRESHOP_STORE_ID}&department_id=${FRESHOP_STOREFRONT_ROOT}&limit=${FRESHOP_PAGE_SIZE}&skip=${skip}&sort=name&name_sort=asc`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.items) ? (data.items as FreshopProduct[]) : null;
  } catch {
    return null;
  }
}

/** Browsable-store size (storefront tree only) — null when Freshop won't answer. */
export async function fetchFreshopTotal(): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.freshop.ncrcloud.com/1/products?app_key=${FRESHOP_APP_KEY}&store_id=${FRESHOP_STORE_ID}&department_id=${FRESHOP_STOREFRONT_ROOT}&limit=1`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.total === 'number' && data.total > 0 ? data.total : null;
  } catch {
    return null;
  }
}

// ── Full-store import helpers ────────────────────────────────────────────

/** First two segments of the shop path: "shop/produce/fresh_fruit/…" → ["produce","fresh_fruit"] */
function deptPath(p: FreshopProduct): string[] {
  const m = (p.canonical_url || '').match(/\/shop\/([^/]+)(?:\/([^/]+))?/);
  return m ? [m[1] || '', m[2] || ''] : ['', ''];
}

/** Alcohol can't be delivered to boats — exclude the whole Beer/Wine/Spirits tree. */
export function isAlcohol(p: FreshopProduct): boolean {
  const [top] = deptPath(p);
  if (top.includes('beer') || top.includes('wine') || top.includes('spirit')) return true;
  // Fallback when canonical_url is missing: obvious keywords, guarded against
  // "root beer" / "ginger ale" / "cooking wine" false positives.
  if (!top) {
    const n = (p.name || '').toLowerCase();
    if (/\b(vodka|whiskey|whisky|tequila|bourbon|brandy|liquor|lager|ipa\b|champagne|seltzer.*(alc|%)|malt liquor)\b/.test(n)) return true;
  }
  return false;
}

/** Map the Freshop department path to one of OUR catalog categories. */
export function categoryFrom(p: FreshopProduct): string {
  const [top, second] = deptPath(p);
  if (top === 'produce') return 'Produce';
  if (top === 'meat' || top === 'seafood') return 'Meat & Seafood';
  if (top === 'dairy') return 'Dairy & Eggs';
  if (top.startsWith('frozen')) return 'Frozen Foods';
  if (top === 'bakery' || top === 'deli') return 'Bakery & Deli';
  if (top.includes('home') || top.includes('floral')) return 'Household & Cleaning';
  if (top === 'pantry') {
    if (/beverage|drink|soda|water|juice|coffee|tea/.test(second)) return 'Beverages';
    if (/snack|candy|cookie|chip|sweet|cracker/.test(second)) return 'Snacks & Sweets';
    return 'Pantry & Grocery';
  }
  return 'Pantry & Grocery';
}

/** Pretty sub-category from the second path segment: "fresh_fruit" → "Fresh Fruit". */
export function subCategoryFrom(p: FreshopProduct): string | null {
  const [, second] = deptPath(p);
  if (!second) return null;
  return second.split(/[_-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function isWeighableUpcDigits(upc: string | null | undefined): boolean {
  const digits = (upc || '').replace(/\D/g, '');
  if (!digits) return false;
  const d11 = digits.length === 12 ? digits.slice(0, 11) : digits.padStart(11, '0');
  return d11.length === 11 && d11.startsWith('2') && d11.endsWith('00000');
}

/**
 * Build a NEW products row for a store item the barge catalog doesn't carry.
 * store_only=TRUE keeps it out of the default browse — reachable only through
 * the "browse everything Sinclair's carries" / "shop the rest of the store"
 * flows. Returns null for unsellable rows (no name / no price / alcohol).
 */
export function buildStoreProduct(p: FreshopProduct): Record<string, unknown> | null {
  const name = (p.name || '').trim();
  const price = priceFrom(p);
  if (!name || price == null) return null;
  if (isAlcohol(p)) return null;
  const upcRaw = (p.upc || '').trim() || norm(p.barcode_upc_a) || null;
  const weighable = !!p.is_weight_required || isWeighableUpcDigits(upcRaw);
  const step = typeof p.quantity_step === 'number' && isFinite(p.quantity_step) && p.quantity_step > 0 ? p.quantity_step : null;
  const ratio = typeof p.quantity_size_ratio === 'number' && isFinite(p.quantity_size_ratio) && p.quantity_size_ratio > 0 ? p.quantity_size_ratio : null;
  return {
    description: name,
    details: detailsFrom(p),
    category: categoryFrom(p),
    sub_category: subCategoryFrom(p),
    upc: upcRaw,
    pkg_size: (p.size || '').trim() || null,
    uom: weighable ? 'LB' : 'EA',
    price,
    image_url: imageFrom(p),
    location: locationFrom(p),
    location_seq: locationSeqFrom(p),
    quantity_step: step,
    quantity_label: (p.quantity_label || '').trim() || null,
    quantity_size_ratio: ratio,
    billed_by_weight: weighable,
    freshop_id: p.id != null ? String(p.id) : null,
    store_only: true,
    is_active: true,
    is_available: (p.status || 'available') === 'available',
  };
}
