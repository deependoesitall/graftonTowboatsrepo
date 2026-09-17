// src/lib/product-index.ts
//
// EVERY PRODUCT WE STOCK, BY EVERY IDENTITY SINCLAIR'S MIGHT USE.
//
// ⚠️ THIS EXISTS BECAUSE `.select()` SILENTLY RETURNS 1,000 ROWS.
//
// PostgREST caps an unbounded select. The catalogue is ~22,000 rows, so
//
//     supabase.from('products').select('id, freshop_id')
//
// looks like "every product" and is in fact the first thousand, in whatever
// order Postgres felt like. There is no error, no warning, and the map built
// from it is perfectly well-formed — just missing 95% of the shop.
//
// That is what broke the Best Sellers rail. Sinclair's top items are Yellow
// Bananas (#1), Ground Beef (#4), Sweet Corn (#5), Eggs (#6), Mac & Cheese
// (#7), Calhoun Peaches and Russet Potato (#11). Ours showed the beef and the
// peaches and skipped the rest — not because the rail asked Freshop the wrong
// question, and not because we don't stock bananas, but because bananas were
// row 12,000 of a lookup that stopped at 1,000. Everything that missed was
// dropped by `if (!productId) return null;  // we don't stock it`, which was a
// comment stating something untrue.
//
// The same one-line mistake was in /api/active-deals, where it quietly hid
// coupons from most of the catalogue.
//
// Anything that needs to match a Freshop item to one of our rows uses this.

import type { SupabaseClient } from '@supabase/supabase-js';
import { freshopKeys, ourKeys, type FreshopProduct } from '@/lib/freshop-sync';
import { isHotPreparedSubCategory } from '@/lib/catalog-exclusions';

/**
 * The bare identity of one of Sinclair's items.
 *
 * Deliberately narrower than FreshopProduct: the rail builder keeps only these
 * fields on a RailItem, and a matcher that demanded the whole 60-field product
 * would force every caller to carry one around.
 */
export interface ProductIdentity {
  id?: string | number | null;
  upc?: string | null;
  barcode_upc_a?: string | null;
  barcode_ean13?: string | null;
}

const PAGE = 1000;

export interface IndexedProduct {
  id: string;
  freshop_id: string | null;
  upc: string | null;
  sub_category: string | null;
}

export interface ProductIndex {
  /** Sinclair's product id → our uuid(s). The exact, trustworthy match. */
  byFreshop: Map<string, string[]>;
  /** Normalised UPC / PLU → our uuid. The net for rows enrich never linked. */
  byUpc: Map<string, string>;
  /** How many rows were actually read — the number the 1,000 cap used to hide. */
  count: number;
}

/**
 * Load the catalogue's identity columns, ALL of them.
 *
 * Paginated explicitly, the same way the nightly catalogue sync does it. Note
 * the loop condition: it stops on a short page, so a catalogue that happens to
 * be an exact multiple of 1,000 costs one extra empty round trip rather than
 * silently truncating.
 */
export async function loadProductIndex(
  supabase: SupabaseClient,
  opts: { activeOnly?: boolean; excludeHotPrepared?: boolean } = {},
): Promise<ProductIndex> {
  const byFreshop = new Map<string, string[]>();
  const byUpc = new Map<string, string>();
  let count = 0;

  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('products')
      .select('id, freshop_id, upc, sub_category')
      .range(from, from + PAGE - 1);
    if (opts.activeOnly) q = q.eq('is_active', true);
    // Hot prepared food is filtered per row below rather than in the query.
    // It is excluded with a PostgREST .or(), and an .or() combined with
    // .range() pagination is a trap — the two do not compose the way they
    // read. The catalogue is 22k thin rows either way.

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data || []) as IndexedProduct[];
    count += rows.length;

    for (const p of rows) {
      if (opts.excludeHotPrepared && isHotPreparedSubCategory(p.sub_category)) continue;
      if (p.freshop_id) {
        const list = byFreshop.get(p.freshop_id);
        if (list) list.push(p.id);
        else byFreshop.set(p.freshop_id, [p.id]);
      }
      // First row wins a UPC key. Size variants and the odd duplicate share
      // barcodes, and a rail only ever needs one card per item.
      if (p.upc) {
        for (const k of ourKeys(p.upc)) if (!byUpc.has(k)) byUpc.set(k, p.id);
      }
    }

    if (rows.length < PAGE) break;
  }

  return { byFreshop, byUpc, count };
}

export type MatchedBy = 'freshop_id' | 'upc';

export interface Match {
  productId: string;
  by: MatchedBy;
}

/**
 * Find our row for one of Sinclair's items.
 *
 * ⚠️ FRESHOP ID FIRST, UPC ONLY AS A FALLBACK, AND NOTHING ELSE.
 *
 * The id is exact. The UPC is the net for a product the enrich step never got
 * around to linking — and it is safe here because ourKeys/freshopKeys already
 * handle the one dangerous case: produce carries 4-digit PLUs (bananas 4011,
 * sweet corn 4078, russet 4072) and those must match exactly, because dropping
 * a check digit off a short code collides two unrelated items.
 *
 * There is deliberately NO name match. A rail card carries a price, and a
 * "Best Choice Milk" that matched the wrong size is a wrong price on the
 * storefront. An item we cannot identify by a number is better left off the
 * rail than guessed onto it.
 */
export function matchProduct(index: ProductIndex, item: ProductIdentity): Match | null {
  const fid = item.id != null ? String(item.id) : '';
  const direct = fid ? index.byFreshop.get(fid) : undefined;
  if (direct?.length) return { productId: direct[0], by: 'freshop_id' };

  for (const k of freshopKeys(item as FreshopProduct)) {
    const hit = index.byUpc.get(k);
    if (hit) return { productId: hit, by: 'upc' };
  }
  return null;
}
