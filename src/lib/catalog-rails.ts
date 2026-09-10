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
  isAlcohol, isFloral, isHotFood, isSellableStatus, saleIsActive,
  type FreshopProduct,
} from '@/lib/freshop-sync';

const PAGE = 100;
/** Freshop returns a lot of featured items; more than this is a rail nobody scrolls. */
const MAX_PER_RAIL = 60;

export interface RailItem {
  freshopId: string;
  position: number;
  salePrice: number | null;
  regularPrice: number | null;
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

  const saving = Number(p.offer_unit_saving) || 0;
  const hasCircular = Array.isArray(p.circular_ids) && p.circular_ids.length > 0;
  return saving > 0 || hasCircular;
}

/** Same exclusions the catalogue sync applies. A rail must never surface
 *  something the store itself refuses to sell to a vessel. */
function isCarryable(p: FreshopProduct): boolean {
  return isSellableStatus(p) && !isAlcohol(p) && !isFloral(p) && !isHotFood(p);
}

async function fetchRailPages(query: string): Promise<FreshopSaleFields[]> {
  const out: FreshopSaleFields[] = [];

  for (let skip = 0; skip < 2000; skip += PAGE) {
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
      break;
    }
    if (!res.ok) break;

    const body = await res.json().catch(() => null) as { items?: FreshopSaleFields[] } | null;
    const items = body?.items;
    if (!Array.isArray(items) || items.length === 0) break;

    out.push(...items);
    if (items.length < PAGE) break;
  }

  return out;
}

/**
 * Best sellers — Freshop's featured set, ordered by its popularity RANK.
 * Rank 1 is the most popular, so this sorts ASCENDING. Sorting the other way
 * would produce a "best sellers" rail of the least popular items in the set,
 * which would look plausible and be exactly backwards.
 */
export async function buildBestSellers(): Promise<RailItem[]> {
  const items = (await fetchRailPages('featured=true')).filter(isCarryable);

  return items
    .filter(p => p.id != null)
    .sort((a, b) => (a.popularity ?? 1e9) - (b.popularity ?? 1e9))
    .slice(0, MAX_PER_RAIL)
    .map((p, i) => ({
      freshopId: String(p.id),
      position: i,
      salePrice: null,
      regularPrice: Number(p.base_price ?? p.unit_price) || null,
    }));
}

/** On sale — genuine shelf discounts only. */
export async function buildOnSale(): Promise<RailItem[]> {
  const items = (await fetchRailPages('on_sale=true'))
    .filter(isCarryable)
    .filter(isRealSale);

  return items
    .filter(p => p.id != null)
    // Biggest saving first — that's what a rail like this is for.
    .sort((a, b) => (Number(b.offer_unit_saving) || 0) - (Number(a.offer_unit_saving) || 0))
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
    }));
}
