// src/lib/boats-ordering.ts
//
// Ranking for "See What Boats Are Buying".
// Distinct grocery orders per catalog SKU over 90 days — not pounds, not
// Sinclair popularity. The public rail reads a snapshot in catalog_rails;
// this module rebuilds that snapshot.

import type { createServiceClient } from '@/lib/supabase/server';

export const BOATS_ORDERING_WINDOW_DAYS = 90;
export const BOATS_ORDERING_MIN_CARDS = 8;
/** Suggested public go-live: enough boats that the row is not one cook's list. */
export const BOATS_ORDERING_LIVE_ORDERS = 25;
export const BOATS_ORDERING_LIVE_BOATS = 3;

type Service = ReturnType<typeof createServiceClient>;

export interface BoatsOrderingStats {
  grocery_orders: number;
  distinct_boats: number;
  matched_lines: number;
  distinct_skus: number;
  ready: boolean;
  window_days: number;
}

export interface BoatsOrderingRow {
  product_id: string;
  order_count: number;
  last_purchased: string | null;
  description?: string;
  image_url?: string | null;
  price?: number | null;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function boatsOrderingReady(stats: Pick<BoatsOrderingStats, 'grocery_orders' | 'distinct_boats' | 'distinct_skus'>): boolean {
  return stats.grocery_orders >= BOATS_ORDERING_LIVE_ORDERS
    && stats.distinct_boats >= BOATS_ORDERING_LIVE_BOATS
    && stats.distinct_skus >= BOATS_ORDERING_MIN_CARDS;
}

export async function fetchBoatsOrderingStats(supabase: Service): Promise<BoatsOrderingStats> {
  const { data, error } = await supabase.rpc('boats_ordering_stats', {
    p_days: BOATS_ORDERING_WINDOW_DAYS,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  const stats = {
    grocery_orders: n(row?.grocery_orders),
    distinct_boats: n(row?.distinct_boats),
    matched_lines: n(row?.matched_lines),
    distinct_skus: n(row?.distinct_skus),
    window_days: BOATS_ORDERING_WINDOW_DAYS,
    ready: false,
  };
  stats.ready = boatsOrderingReady(stats);
  return stats;
}

export async function fetchBoatsOrderingRank(supabase: Service, limit = 24): Promise<BoatsOrderingRow[]> {
  const { data, error } = await supabase.rpc('boats_ordering_rank', {
    p_days: BOATS_ORDERING_WINDOW_DAYS,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data || []).map((r: { product_id: string; order_count: number; last_purchased: string | null }) => ({
    product_id: String(r.product_id),
    order_count: n(r.order_count),
    last_purchased: r.last_purchased || null,
  }));
}

/** Rebuild the snapshot rail. Empty ranking wipes the rail (honest empty).
 *  RPC missing (migration not applied) is a no-op so order-place never 500s. */
export async function refreshBoatsOrderingRail(supabase: Service): Promise<{ wrote: number; error?: string }> {
  let ranked: BoatsOrderingRow[];
  try {
    ranked = await fetchBoatsOrderingRank(supabase, 24);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'rank failed';
    console.error('boats_ordering_rank:', msg);
    return { wrote: 0, error: msg };
  }

  const { error: delErr } = await supabase.from('catalog_rails').delete().eq('rail', 'boats_ordering');
  if (delErr) return { wrote: 0, error: delErr.message };
  if (!ranked.length) return { wrote: 0 };

  const now = new Date().toISOString();
  const rows = ranked.map((r, i) => ({
    rail: 'boats_ordering',
    product_id: r.product_id,
    position: i,
    sale_price: null,
    regular_price: null,
    refreshed_at: now,
  }));
  const { error: insErr } = await supabase.from('catalog_rails').insert(rows);
  if (insErr) return { wrote: 0, error: insErr.message };
  return { wrote: rows.length };
}

/** SKUs that appeared on the same grocery order as `productId`. Empty if
 *  the RPC is missing or this product has no basket neighbours yet. */
export async function fetchBoatsAlsoBought(
  supabase: Service,
  productId: string,
  limit = 8,
): Promise<Array<{ product_id: string; order_count: number }>> {
  const { data, error } = await supabase.rpc('boats_also_bought', {
    p_product_id: productId,
    p_days: BOATS_ORDERING_WINDOW_DAYS,
    p_limit: limit,
  });
  if (error) {
    console.error('boats_also_bought:', error.message);
    return [];
  }
  return (data || []).map((r: { product_id: string; order_count: number }) => ({
    product_id: String(r.product_id),
    order_count: n(r.order_count),
  }));
}
