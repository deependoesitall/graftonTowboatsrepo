// src/lib/catalog-rails.ts
//
// Builds the two catalogue rails from Freshop: "What's on sale" and
// "Best sellers". Mirrors what Sinclair's own storefront shows.
//
// ⚠️ THIS IS NOT THE DIGITAL COUPON SYSTEM AND MUST NOT BECOME IT.
//
// Freshop's on_sale feed mixes two very different things:
//
//   · SHELF SALES — the price everyone pays this week. The register rings it
//     up automatically. Safe to advertise.
//
//   · CLIP / LOYALTY OFFERS — "Clip & Save", digital coupons, login-to-clip.
//     These require a Sinclair's account and a clipped coupon. A vessel has
//     neither. Showing one of these as a sale price means the crew orders
//     expecting $2.99 and the register charges $4.25 — and GTS passes that
//     register total through at cost, so the boat is billed the higher number
//     and nobody understands why.
//
// isClipOnly() below is the guard, and it is the single most important
// function in this file.

import {
  FRESHOP_APP_KEY, FRESHOP_STORE_ID,
  isExcludedFromVesselCatalog, isSellableStatus, saleIsActive,
  type FreshopProduct,
} from '@/lib/freshop-sync';

const PAGE = 100;
/** Freshop returns a lot of featured items; more than this is a rail nobody scrolls. */
const MAX_PER_RAIL = 60;
/** Safety stop for the sale pagination. Sinclair's sale set runs ~4k items. */
const MAX_SCAN = 6000;

// ── THE QUERY PARAMETERS FRESHOP ACTUALLY HONOURS ────────────────────
//
// ⚠️ FRESHOP IGNORES A PARAMETER IT DOES NOT RECOGNISE. It does not 400, it
// does not warn — it returns the whole store and a 200, which looks exactly
// like a successful filtered query.
//
// This rail was built on `on_sale=true` and `featured=true`. Neither is a real
// parameter. Measured against the live store (Sept 2026, store 4297):
//
//   on_sale=true    → total 72129   (the entire catalogue)
//   featured=true   → total 72129   (the entire catalogue)
//   is_on_sale=true → total  3887   (the actual sale set)
//
// So the sale rail was paging the general catalogue in popularity order,
// stopping after 2000 rows, and keeping whatever happened to be discounted
// among the 2000 most popular items in the store. It could not match Sinclair's
// sale page because it was never asking for Sinclair's sale page.
//
// `sort=popularity` is the store's own default order — rank 1 is Yellow
// Bananas, which is what the site shows first — so best sellers asks for that
// explicitly rather than relying on a default that could change under us.
const Q_ON_SALE = 'is_on_sale=true';

/**
 * How many items Sinclair's must be publishing before we call it a sale week.
 *
 * Measured Sept 2026, a perfectly ordinary week: 3,887. A real circular is
 * thousands of items, so this is not a judgement call about whether the week is
 * "good enough" — it is the difference between a sale running and no sale
 * running, with a wide margin for a quiet week or a partial feed. Anything at
 * or above it means the sale row exists on their storefront; below it means it
 * does not, and neither should ours.
 */
export const MIN_SALE_UPSTREAM = 25;
const Q_BEST_SELLERS = 'sort=popularity';

export interface RailItem {
  freshopId: string;
  position: number;
  salePrice: number | null;
  regularPrice: number | null;
  /**
   * ⚠️ CARRIED SO THE RAIL CAN STILL FIND THE PRODUCT WHEN freshop_id WAS
   * NEVER LINKED ON OUR ROW. Without these, an item the enrich step has not
   * reached yet is unmatchable and silently drops off the rail — see
   * lib/product-index.
   */
  upc: string | null;
  barcode_upc_a: string | null;
  barcode_ean13: string | null;
}

/**
 * What a rail build found, upstream and after our own filtering.
 *
 * `upstream` is the count Sinclair's is actually publishing. It is the thing
 * that answers "have they turned this off?", and it is deliberately separate
 * from `items.length`, which is what survived OUR filters — clip coupons,
 * alcohol, hot prepared food, items we do not stock. An empty rail because
 * Sinclair's has no sale on is a different fact from an empty rail because we
 * stripped every card, and only the first one should take the rail down.
 */
export interface RailBuild {
  items: RailItem[];
  upstream: number;
  /** True when the fetch itself failed or was cut short — counts mean nothing. */
  incomplete: boolean;
}

interface FreshopSaleFields extends FreshopProduct {
  /** Present on genuine shelf sales. */
  offer_unit_saving?: number;
  /** Weekly-ad membership — a real circular, not a coupon. */
  circular_ids?: string[];
  /** Where Freshop names the offer. This is what betrays a clip coupon. */
  offer_name?: string;
  offer_description?: string;
  offer_type?: string;
  /** Some feeds flag it directly. Trusted when present, never relied on alone. */
  is_coupon?: boolean;
  requires_loyalty?: boolean;
}

/**
 * TRUE when an offer needs a Sinclair's login or a clipped coupon.
 *
 * Deliberately over-eager. A shelf sale wrongly excluded costs us one card on
 * a rail; a clip coupon wrongly included costs a barge line real money and
 * costs GTS the trust that the prices on this site mean something. When in
 * doubt, leave it out.
 */
export function isClipOnly(p: FreshopSaleFields): boolean {
  if (p.is_coupon === true) return true;
  if (p.requires_loyalty === true) return true;

  const haystack = [p.offer_name, p.offer_description, p.offer_type]
    .filter(Boolean).join(' ').toLowerCase();

  if (!haystack) return false;

  return /clip|coupon|digital|loyalty|load(ed)? to card|sign in|log ?in|member(ship)? price|rewards?/
    .test(haystack);
}

/** A genuine shelf sale we can advertise. */
export function isRealSale(p: FreshopSaleFields): boolean {
  if (isClipOnly(p)) return false;

  // Must actually be discounted right now. `saleIsActive` checks the
  // start/finish window — Freshop happily returns next week's sale early, and
  // showing a price that isn't live yet is the same failure as showing one
  // that has ended.
  if (!saleIsActive(p)) return false;

  // ⚠️ A CIRCULAR IS NOT A DISCOUNT.
  //
  // Being in the weekly ad used to be enough to qualify. It isn't: Sinclair's
  // runs everyday items in the circular at their ordinary price (FRESH GROUND
  // BEEF 80% LEAN, measured Sept 2026 — base 5.99, offer 5.99, saving 0.00, in
  // 27 circulars). Those arrived on the rail under a "sale" heading with a
  // struck-through price identical to the red one, which reads as a fake
  // discount and teaches a crew to distrust every price on the page.
  //
  // The test is the only one that means anything: is this cheaper than the
  // shelf price, right now?
  const saving = Number(p.offer_unit_saving) || 0;
  const base = Number(p.base_price);
  const sale = Number(p.offer_sale_price);
  if (isFinite(base) && base > 0 && isFinite(sale)) return sale < base;
  return saving > 0;
}

/** Same exclusions the catalogue sync applies. A rail must never surface
 *  something the store itself refuses to sell to a vessel. */
function isCarryable(p: FreshopProduct): boolean {
  return isSellableStatus(p) && !isExcludedFromVesselCatalog(p);
}

interface PageFetch {
  items: FreshopSaleFields[];
  /** Freshop's own count for this query — the size of the set upstream. */
  total: number;
  /** True when we stopped early for any reason other than running out of rows. */
  incomplete: boolean;
}

async function fetchRailPages(query: string, maxRows = MAX_SCAN): Promise<PageFetch> {
  const out: FreshopSaleFields[] = [];
  let total = 0;
  let sawTotal = false;
  let incomplete = false;

  for (let skip = 0; skip < maxRows; skip += PAGE) {
    const url =
      `https://api.freshop.ncrcloud.com/1/products`
      + `?app_key=${FRESHOP_APP_KEY}&store_id=${FRESHOP_STORE_ID}`
      + `&${query}&limit=${PAGE}&skip=${skip}`;

    let res: Response;
    try {
      res = await fetch(url, { cache: 'no-store' });
    } catch {
      // Network failure mid-page. Return what we have rather than nothing —
      // a short rail beats an empty one, and the next nightly run fixes it.
      // Flagged incomplete so nothing downstream reads this as "Sinclair's
      // has stopped running sales".
      incomplete = true;
      break;
    }
    if (!res.ok) { incomplete = true; break; }

    const body = await res.json().catch(() => null) as
      { items?: FreshopSaleFields[]; total?: number } | null;
    if (!body) { incomplete = true; break; }

    if (typeof body.total === 'number') { total = body.total; sawTotal = true; }

    const items = body.items;
    if (!Array.isArray(items) || items.length === 0) break;

    out.push(...items);
    if (items.length < PAGE) break;
  }

  // No total came back at all — we cannot claim to know the upstream size.
  if (!sawTotal) { incomplete = true; total = out.length; }

  return { items: out, total, incomplete };
}

/**
 * Best sellers — Freshop's featured set, ordered by its popularity RANK.
 * Rank 1 is the most popular, so this sorts ASCENDING. Sorting the other way
 * would produce a "best sellers" rail of the least popular items in the set,
 * which would look plausible and be exactly backwards.
 */
export async function buildBestSellers(): Promise<RailBuild> {
  // Only the first few hundred rows can ever reach a 60-card rail, and the
  // query is already in rank order, so there is no reason to walk the store.
  const page = await fetchRailPages(Q_BEST_SELLERS, 600);
  const carryable = page.items.filter(isCarryable);

  const items = carryable
    .filter(p => p.id != null)
    .sort((a, b) => (a.popularity ?? 1e9) - (b.popularity ?? 1e9))
    .slice(0, MAX_PER_RAIL)
    .map((p, i) => ({
      freshopId: String(p.id),
      position: i,
      salePrice: null,
      regularPrice: Number(p.base_price ?? p.unit_price) || null,
      upc: p.upc ?? null,
      barcode_upc_a: p.barcode_upc_a ?? null,
      barcode_ean13: p.barcode_ean13 ?? null,
    }));

  // Best sellers is the store's own ranking of its own catalogue. There is no
  // such thing as Sinclair's "turning it off" — if this comes back empty, the
  // fetch failed, so upstream is reported as what we actually saw.
  return { items, upstream: carryable.length, incomplete: page.incomplete };
}

/** On sale — genuine shelf discounts only. */
export async function buildOnSale(): Promise<RailBuild> {
  const page = await fetchRailPages(Q_ON_SALE);
  const kept = page.items
    .filter(isCarryable)
    .filter(isRealSale);

  const items = kept
    .filter(p => p.id != null)
    // ⚠️ SINCLAIR'S ORDER, NOT OURS.
    //
    // This sorted by biggest absolute saving, which sounds right and is not:
    // measured against the live sale set (Sept 2026), the top of that rail was
    // a $109 bucket of cream-cheese icing, a $39 bulk box of bacon and three
    // sizes of Huggies. Those carry the largest dollar discounts in the store
    // and none of them is going on a towboat.
    //
    // Sinclair's own sale page is in popularity order, so ordering by the same
    // rank shows the same items in the same sequence — bananas, ground beef,
    // grapes — which is both what a crew is looking for and what the brief
    // asked for: the rail should look like theirs.
    .sort((a, b) => (a.popularity ?? 1e9) - (b.popularity ?? 1e9))
    .slice(0, MAX_PER_RAIL)
    .map((p, i) => ({
      freshopId: String(p.id),
      position: i,
      salePrice: Number(p.offer_sale_price) || null,
      // Only meaningful when it's actually higher — otherwise the card would
      // strike through a number equal to the sale price, which reads as a fake
      // discount and is worse than showing no comparison at all.
      regularPrice:
        Number(p.base_price) > (Number(p.offer_sale_price) || 0)
          ? Number(p.base_price)
          : null,
      upc: p.upc ?? null,
      barcode_upc_a: p.barcode_upc_a ?? null,
      barcode_ean13: p.barcode_ean13 ?? null,
    }));

  // ⚠️ `upstream` IS SINCLAIR'S ANSWER, NOT OURS. It is the size of their sale
  // set before any of our filtering, and it is what the nightly job uses to
  // decide whether they are running a sale week at all. Reporting items.length
  // here instead would take our rail down every time we happened to filter out
  // a thin week's worth of clip coupons, which is a different thing entirely.
  return { items, upstream: page.total, incomplete: page.incomplete };
}
