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
// (probed live July 19, 2026).
export const FRESHOP_STOREFRONT_ROOT = '21585437';

// The sync fetches DEPARTMENT BY DEPARTMENT (not the root tree) because:
//  1. Alcohol exclusion becomes airtight — the Beer/Wine/Spirits tree
//     (1595059) is simply never requested.
//  2. Category mapping is authoritative — an item's category is the
//     department we fetched it from. (canonical_url parsing failed: the AWG
//     general-merch items have FLAT product URLs with no department path.)
//  3. Junk outside the 9 real departments is never fetched at all.
// IDs probed live from /1/departments, July 19 2026.
export const FRESHOP_DEPARTMENTS: Array<{ id: string; name: string; category: string }> = [
  { id: '1595064', name: 'Meat',          category: 'Meat & Seafood' },
  { id: '1595067', name: 'Seafood',       category: 'Meat & Seafood' },
  { id: '1595060', name: 'Dairy',         category: 'Dairy' },
  { id: '1595066', name: 'Produce',       category: 'Produce' },
  { id: '1595062', name: 'Frozen Foods',  category: 'Frozen Foods' },
  { id: '1595058', name: 'Bakery',        category: 'Bakery & Deli' },
  { id: '1595061', name: 'Deli',          category: 'Bakery & Deli' },
  { id: '1595065', name: 'Pantry',        category: 'Pantry & Grocery' },
  // 1595063 Home & Floral — INTENTIONALLY ABSENT. Probed live July 2026: the
  //   whole department is bouquets, plants, ferns, mulch and topsoil — nothing
  //   a boat crew orders. Every real household item (dish soap, paper towels,
  //   detergent, trash bags) lives under Pantry, so nothing useful is lost.
  // 1595059 Beer, Wine & Spirits — INTENTIONALLY ABSENT (can't deliver alcohol)
];

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
  /** Sale fields — present only while an offer runs. offer_sale_price is what
   *  it actually rings at; base_price stays the regular shelf price. */
  offer_sale_price?: number;
  sale_start_date?: string;   // "2026-07-29"
  sale_finish_date?: string;  // "2026-08-25"
  quantity_step?: number;
  quantity_label?: string;
  quantity_size_ratio?: number;
  /** e.g. "https://shop.sinclairsfoods.com/shop/produce/fresh_fruit/.../p/12413" — dept path drives category + alcohol exclusion */
  canonical_url?: string;
  department_ids?: string[];
  status?: string;
  /** Freshop's store-wide popularity RANK (1 = most popular). Drives the
   * "People who bought this also bought" row — same signal Sinclair's own
   * storefront sorts by. */
  popularity?: number;
}

export interface SyncableProduct {
  id: string;
  upc: string | null;
  details: string | null;
  image_url: string | null;
  billed_by_weight: boolean;
  location: string | null;
  location_seq: number | null;
  /** TRUE = an admin corrected this location by hand — never overwrite it.
   * (Legacy — superseded by manual_fields, still honored for old rows.) */
  location_manual?: boolean;
  /** Field names a human edited in the admin — the sync never overwrites these,
   * so hand-entered descriptions, prices, etc. persist through every sync and
   * survive seasonal items going inactive and coming back. */
  manual_fields?: string[] | null;
  price: number;
  quantity_step: number | null;
  quantity_label: string | null;
  quantity_size_ratio: number | null;
  freshop_id: string | null;
  popularity: number | null;
}

// ── UPC normalization (identical to the client enrich) ──
export function norm(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim().replace(/\.0+$/, '');
  return s.replace(/\D/g, '').replace(/^0+/, '');
}
// Check-digit tolerance (dropping the last digit) is ONLY valid for full-length
// barcodes — it's meant to bridge a UPC-A that carries its check digit vs one
// that doesn't. Produce items use short 4–5 digit PLU codes, and truncating
// those just collides two unrelated items (a cucumber PLU matching a mushroom
// row → wrong photo). So the drop-a-digit key is gated on length >= 8; short
// PLUs must match EXACTLY.
const CHECKDIGIT_MIN_LEN = 8;

export function freshopKeys(p: FreshopProduct): string[] {
  const keys = new Set<string>();
  for (const raw of [p.upc, p.barcode_upc_a, p.barcode_ean13]) {
    const n = norm(raw);
    if (n.length >= 4) keys.add(n);
  }
  const upcA = norm(p.barcode_upc_a);
  if (upcA.length >= CHECKDIGIT_MIN_LEN) keys.add(upcA.slice(0, -1));
  return Array.from(keys);
}
export function ourKeys(upc: string): string[] {
  const n = norm(upc);
  if (n.length < 4) return [];
  const keys = [n];
  if (n.length >= CHECKDIGIT_MIN_LEN) keys.push(n.slice(0, -1));
  return keys;
}

// ── Field mappers (identical to the client enrich) ──
function stripZzz(s: string): string {
  return s.replace(/\s*\(?\d+(\.\d+)?\s*zzz\)?/gi, '').trim();
}
/** A usable size — rejects Freshop's zero placeholders ("0", "0.0000", "00"). */
function isRealSize(s: string): boolean {
  return !!s && !/^0+(\.0+)?$/.test(s.trim());
}
function detailsFrom(p: FreshopProduct): string | null {
  const name = stripZzz((p.name || '').trim());
  if (!name) return null;
  const size = stripZzz((p.size || '').trim());
  // Only append a REAL size — never a "0.0000" placeholder (that leaked into
  // names like "5 LB RUSSET (0.0000)").
  if (isRealSize(size) && !name.toLowerCase().includes(size.toLowerCase())) return `${name} (${size})`;
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
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Is the advertised sale live today? Freshop keeps finished offers on the
 *  record, so the dates have to be checked rather than trusted by presence. */
export function saleIsActive(p: FreshopProduct, today = new Date()): boolean {
  if (typeof p.offer_sale_price !== 'number' || !isFinite(p.offer_sale_price)) return false;
  const day = today.toISOString().slice(0, 10);
  if (p.sale_start_date && day < p.sale_start_date) return false;
  if (p.sale_finish_date && day > p.sale_finish_date) return false;
  return true;
}

/**
 * The price we CHARGE — the sale price while a sale runs, else the shelf price.
 *
 * Storing the effective price in products.price means every existing
 * calculation (cart totals, estimates, invoices, the COD handling fee) keeps
 * working untouched and simply gets the sale number. regular_price carries the
 * struck-through figure for display only.
 */
function priceFrom(p: FreshopProduct): number | null {
  const raw = saleIsActive(p)
    ? p.offer_sale_price
    : (p.base_price ?? p.unit_price);
  if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) return null;
  return round2(raw);
}

/** Display-only sale fields. All null when nothing is on sale, so
 *  "regular_price IS NOT NULL" is the single test for "on sale right now". */
export function saleFieldsFrom(p: FreshopProduct): {
  regular_price: number | null; sale_start_date: string | null; sale_finish_date: string | null;
} {
  if (!saleIsActive(p)) return { regular_price: null, sale_start_date: null, sale_finish_date: null };
  const regular = p.base_price ?? p.unit_price;
  // A "sale" that isn't cheaper isn't a sale — don't print a struck-through
  // price that matches the one beside it.
  if (typeof regular !== 'number' || !isFinite(regular) || regular <= (p.offer_sale_price ?? 0)) {
    return { regular_price: null, sale_start_date: null, sale_finish_date: null };
  }
  return {
    regular_price: round2(regular),
    sale_start_date: p.sale_start_date ?? null,
    sale_finish_date: p.sale_finish_date ?? null,
  };
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

  // Fields a human edited in the admin are OFF-LIMITS to the sync — forever,
  // and through inactive/seasonal cycles. Legacy location_manual still counts.
  const locked = new Set(product.manual_fields || []);
  if (product.location_manual) { locked.add('location'); locked.add('location_seq'); }

  const newDetails = detailsFrom(hit);
  const newImage = imageFrom(hit);
  if (!locked.has('details') && newDetails && !product.details && newDetails !== product.details) { fields.details = newDetails; stats.details++; }
  if (!locked.has('image_url') && newImage && !product.image_url && newImage !== product.image_url) { fields.image_url = newImage; fields.image_source = 'sinclair_sync'; stats.images++; }
  if (!locked.has('billed_by_weight') && hit.is_weight_required && !product.billed_by_weight) { fields.billed_by_weight = true; stats.weightFlags++; }
  // Locations sync from Freshop's walkpath — EXCEPT where an admin corrected
  // one by hand: the humans in the store outrank the data.
  if (!locked.has('location')) {
    const newLocation = locationFrom(hit);
    const newSeq = locationSeqFrom(hit);
    if (newLocation && (newLocation !== product.location || newSeq !== product.location_seq)) {
      fields.location = newLocation;
      fields.location_seq = newSeq;
      stats.locations++;
    }
  }
  const newPrice = priceFrom(hit);
  if (!locked.has('price') && newPrice != null && Math.abs(newPrice - Number(product.price)) >= 0.005) {
    fields.price = newPrice;
    stats.prices++;
  }
  // Sale display fields ride along with price. ALWAYS written — including back
  // to null — because a finished sale has to stop showing a struck-through
  // price the moment it expires. Sinclair's ad turns over at midnight Tuesday.
  if (!locked.has('price')) {
    const sale = saleFieldsFrom(hit);
    if (sale.regular_price !== (product as { regular_price?: number | null }).regular_price) {
      fields.regular_price = sale.regular_price;
      fields.sale_start_date = sale.sale_start_date;
      fields.sale_finish_date = sale.sale_finish_date;
    }
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
  // Popularity rank — always synced (it shifts as the store's sales shift).
  const newPop = typeof hit.popularity === 'number' && isFinite(hit.popularity) && hit.popularity > 0
    ? Math.round(hit.popularity) : null;
  if (newPop !== product.popularity) fields.popularity = newPop;
  return Object.keys(fields).length ? fields : null;
}

/**
 * One Freshop catalog page. Null on rate limit/error.
 *
 * TWO PARAMETERS DECIDE WHETHER THIS WHOLE SYNC WORKS. Both were measured
 * against the live API on Sept 5, 2026; neither is guesswork.
 *
 * 1. `department_id_cascade=true` — WITHOUT it, a department query returns only
 *    the items pinned directly to that node, NOT its subtree. Pantry answers
 *    500 without it and 30,992 with it. That single missing parameter is why
 *    the store mirror sat at ~688 rows: the sweep asked 8 parent departments
 *    for their direct children and never saw the 1,332 sub-departments where
 *    the actual groceries live.
 *
 * 2. NO `sort` PARAMETER. This looks harmless and is not. Freshop's DEFAULT
 *    order returns every live item first, then the dead stock:
 *
 *        default sort  → skip 0: 100/100 available · 8,000: 100/100
 *        sort=name     → skip 0:  10/100 available · 8,000:  57/100
 *
 *    Live items run contiguously to roughly skip 12,200 out of 72,056 listings.
 *    Sorting by name shuffles the ~60,000 delisted SKUs in among them, turning
 *    a 123-page sweep into a 720-page one. We used to send
 *    `sort=name&name_sort=asc`. Do not put it back.
 */
export async function fetchFreshopPage(departmentId: string, skip: number): Promise<FreshopProduct[] | null> {
  try {
    const res = await fetch(
      `https://api.freshop.ncrcloud.com/1/products?app_key=${FRESHOP_APP_KEY}&store_id=${FRESHOP_STORE_ID}&department_id=${departmentId}&department_id_cascade=true&limit=${FRESHOP_PAGE_SIZE}&skip=${skip}`,
      { cache: 'no-store' },
    );
    // THROTTLE IN DISGUISE: NCR answers a rate limit with HTTP 400 and a body
    // of {"error_code":429}. Read the body even on a non-OK status — a caller
    // that trusts the HTTP code alone reads a temporary throttle as a
    // permanent bad request and gives up on a page that would have succeeded.
    const data = await res.json().catch(() => null);
    if (isFreshopThrottled(data) || !res.ok) return null;
    return Array.isArray(data?.items) ? (data.items as FreshopProduct[]) : null;
  } catch {
    return null;
  }
}

/** NCR signals rate limiting as `{"error_code":429}` inside an HTTP 400. */
export function isFreshopThrottled(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as { error_code?: number }).error_code === 429;
}

/**
 * Is this listing actually live on Sinclair's website?
 *
 * `available` (status_id 1) = on their storefront.
 * `no_movement` (status_id 3) = delisted; Freshop still serves it, their site
 * does not show it. Bakery alone: 1,824 listings, 84 available.
 *
 * The API will NOT filter on this — `status=available`, `status_id=1` and
 * `statuses=available` all return the identical unfiltered total. It has to be
 * done here.
 */
export function isSellableStatus(p: FreshopProduct): boolean {
  const s = (p.status || '').trim().toLowerCase();
  if (s) return s === 'available';
  const id = (p as { status_id?: string | number }).status_id;
  if (id != null) return String(id) === '1';
  return true;                       // no signal either way — don't drop it
}

/**
 * Fetch several pages CONCURRENTLY. NCR tolerates a handful of parallel reads
 * far better than it tolerates a long serial crawl (the old 1.2s-per-page
 * pacing spent most of the function's time budget asleep). Any page returning
 * null (rate limit / error) aborts the batch — the caller checkpoints what
 * succeeded and the next invocation retries the rest.
 */
export async function fetchFreshopPages(
  reqs: Array<{ departmentId: string; skip: number }>,
): Promise<Array<FreshopProduct[] | null>> {
  return Promise.all(reqs.map(r => fetchFreshopPage(r.departmentId, r.skip)));
}

/**
 * Item count for one department subtree — null when Freshop won't answer.
 *
 * RETRIES, DELIBERATELY. Sizing is the single most consequential call in the
 * whole sync: whatever it returns becomes `pages`, and the sweep never looks
 * beyond that. A short answer here doesn't fail loudly — it silently imports a
 * fraction of the store and then reports itself "done".
 *
 * That is exactly what happened: eight departments sized concurrently, NCR
 * throttled the burst, and the store sized at 775 when Bakery alone reports
 * 1,820. So: retry with backoff, and take the LARGEST answer across attempts —
 * a throttled response can come back short, but it can never come back too big.
 */
export async function fetchFreshopTotal(departmentId: string): Promise<number | null> {
  let best: number | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 600 * attempt));
    try {
      const res = await fetch(
        `https://api.freshop.ncrcloud.com/1/products?app_key=${FRESHOP_APP_KEY}&store_id=${FRESHOP_STORE_ID}&department_id=${departmentId}&department_id_cascade=true&limit=1`,
        { cache: 'no-store' },
      );
      const data = await res.json().catch(() => null);
      if (isFreshopThrottled(data) || !res.ok) continue;   // throttle/5xx — back off and retry
      const total = typeof data?.total === 'number' && data.total > 0 ? data.total : null;
      if (total != null && (best == null || total > best)) best = total;
      // Two consecutive agreeing reads is enough; don't burn requests needlessly.
      if (attempt >= 1 && best != null) break;
    } catch {
      /* network blip — retry */
    }
  }
  return best;
}

// ── Full-store import helpers ────────────────────────────────────────────

/** First two segments of the shop path: "shop/produce/fresh_fruit/…" → ["produce","fresh_fruit"] */
function deptPath(p: FreshopProduct): string[] {
  const m = (p.canonical_url || '').match(/\/shop\/([^/]+)(?:\/([^/]+))?/);
  return m ? [m[1] || '', m[2] || ''] : ['', ''];
}

/**
 * Belt-and-braces alcohol guard. The Beer/Wine/Spirits department is never
 * even fetched, so this only catches strays cross-listed into other
 * departments. Name-keyword based, guarded against "root beer" / "ginger
 * ale" / "cooking wine" false positives.
 */
export function isAlcohol(p: FreshopProduct): boolean {
  const [top] = deptPath(p);
  if (top.includes('beer') || top.includes('wine') || top.includes('spirit')) return true;
  const n = (p.name || '').toLowerCase();
  return /\b(vodka|whiskey|whisky|tequila|bourbon|brandy|liquor|lager|malt liquor|champagne|hard seltzer|hard cider|ipa)\b/.test(n);
}

/**
 * Belt-and-braces floral/garden guard. The Home & Floral department is never
 * fetched, so this only catches strays cross-listed into other departments.
 * Boats don't order bouquets, houseplants, or landscaping supplies.
 */
export function isFloral(p: FreshopProduct): boolean {
  const [top] = deptPath(p);
  if (top === 'home_floral') return true;
  const n = (p.name || '').toLowerCase();
  return /\b(bouquet|bqt|floral|fresh cut|houseplant|potting soil|top ?soil|peat moss|mulch|perennial|succulent|orchid|hanging basket)\b/.test(n);
}

/**
 * Refine the department's base category for Pantry items using the item's
 * canonical sub-path when present ("pantry/beverages/…" → Beverages).
 * AWG flat-URL items simply keep the department category.
 */
/**
 * Sinclair's top-level department (first canonical_url segment) → our category.
 *
 * This became load-bearing when the sweep switched to one cascading walk of the
 * storefront root. Items no longer arrive tagged with the department we asked
 * for, because we only ask for one — so each item's own URL is the only signal
 * of what it is. Get this wrong and the entire store files under one heading.
 *
 * Verified against live canonical_urls, e.g.
 *   /shop/pantry/condiments/ketchup/heinz_tomato_ketchup_20_oz
 *   /shop/meat/packaged_hot_dogs_sausages_lunch_meat/sausages/...
 */
const DEPT_TO_CATEGORY: Record<string, string> = {
  meat: 'Meat & Seafood',
  seafood: 'Meat & Seafood',
  dairy: 'Dairy',
  produce: 'Produce',
  frozen: 'Frozen Foods',
  frozen_foods: 'Frozen Foods',
  bakery: 'Bakery & Deli',
  deli: 'Bakery & Deli',
  pantry: 'Pantry & Grocery',
  home_floral: 'Household & Cleaning',
  // beer_wine_spirits is absent on purpose — isAlcohol() drops those first.
};

export function refineCategory(baseCategory: string, p: FreshopProduct): string {
  const [first, second] = deptPath(p);
  // The item's own URL wins. A flat URL (AWG bulk rows carry no /shop/<dept>/
  // path) falls back to whatever the caller supplied.
  const fromUrl = DEPT_TO_CATEGORY[first.toLowerCase()];
  const base = fromUrl || baseCategory;
  if (base !== 'Pantry & Grocery') return base;
  if (/beverage|drink|soda|water|juice|coffee|tea/.test(second)) return 'Beverages';
  if (/snack|candy|cookie|chip|sweet|cracker/.test(second)) return 'Snacks & Sweets';
  return base;
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
 * `deptCategory` = OUR category for the department this item was fetched from
 * (authoritative — canonical_url is unreliable for the AWG flat-URL items).
 * store_only=TRUE keeps it out of the default browse — reachable only through
 * the "browse everything Sinclair's carries" / "shop the rest of the store"
 * flows. Returns null for unsellable rows (no name / no price / alcohol).
 */
export function buildStoreProduct(p: FreshopProduct, deptCategory: string): Record<string, unknown> | null {
  const name = (p.name || '').trim();
  const price = priceFrom(p);
  const sale = saleFieldsFrom(p);
  if (!name || price == null) return null;
  // DEAD STOCK NEVER BECOMES A ROW.
  //
  // Freshop keeps every SKU the store has ever carried and serves them through
  // the same endpoint: of 72,056 listings under the storefront root, only about
  // 12,200 are `available`. The rest are `no_movement` — delisted, and absent
  // from Sinclair's own website.
  //
  // These used to be inserted with is_available=false, which meant roughly five
  // out of every six rows the sweep wrote could never appear on the site, while
  // consuming the whole nightly budget. Skipping them here is the difference
  // between a sweep that finishes and one that never has.
  if (!isSellableStatus(p)) return null;
  if (isAlcohol(p)) return null;
  if (isFloral(p)) return null;
  const upcRaw = (p.upc || '').trim() || norm(p.barcode_upc_a) || null;
  const weighable = !!p.is_weight_required || isWeighableUpcDigits(upcRaw);
  const step = typeof p.quantity_step === 'number' && isFinite(p.quantity_step) && p.quantity_step > 0 ? p.quantity_step : null;
  const ratio = typeof p.quantity_size_ratio === 'number' && isFinite(p.quantity_size_ratio) && p.quantity_size_ratio > 0 ? p.quantity_size_ratio : null;
  // Freshop pollutes name/size fields with placeholder junk ("1.0000 zzz",
  // "0.0000") — strip it everywhere, and treat zero-ish sizes as no size.
  const cleanSize = stripZzz((p.size || '').trim());
  return {
    description: stripZzz(name),
    details: detailsFrom(p),
    category: refineCategory(deptCategory, p),
    sub_category: subCategoryFrom(p),
    upc: upcRaw,
    pkg_size: isRealSize(cleanSize) ? cleanSize : null,
    uom: weighable ? 'LB' : 'EA',
    price,
    regular_price: sale.regular_price,
    sale_start_date: sale.sale_start_date,
    sale_finish_date: sale.sale_finish_date,
    image_url: imageFrom(p),
    image_source: imageFrom(p) ? 'sinclair_sync' : null,
    location: locationFrom(p),
    location_seq: locationSeqFrom(p),
    quantity_step: step,
    quantity_label: (p.quantity_label || '').trim() || null,
    quantity_size_ratio: ratio,
    billed_by_weight: weighable,
    freshop_id: p.id != null ? String(p.id) : null,
    popularity: typeof p.popularity === 'number' && isFinite(p.popularity) && p.popularity > 0
      ? Math.round(p.popularity) : null,
    store_only: true,
    is_active: true,
    is_available: (p.status || 'available') === 'available',
  };
}
