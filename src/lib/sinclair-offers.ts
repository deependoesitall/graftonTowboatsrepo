// src/lib/sinclair-offers.ts
// Digital coupon rule engine — server-side only.
//
// Sinclair's offers are machine-readable (verified live):
//   config: { type: "price_off_total", price_off: 3.0, quantity_minimum: 4 }
//   product_ids: [...their internal product ids...]
//   redemption_limit: 1   (per-transaction cap)
// So "SAVE $3.00 WHEN YOU BUY ANY FOUR (4) PARTICIPATING PEPSI-COLA
// BEVERAGES" is exact arithmetic, not text parsing. We match their product
// ids against products.freshop_id (captured by enrich).
//
// Savings are ESTIMATES until Sinclair's rings the order — wording matters
// everywhere these numbers are shown.

export interface ActiveDeal {
  id: string;            // Sinclair offer id
  name: string;          // "SAVE $3.00"
  description: string | null;
  brand: string | null;
  amount: number;        // dollars off per redemption
  min_qty: number;       // qualifying units required
  redemption_limit: number; // max redemptions per order (usually 1)
  finish_date: string | null;
  freshop_product_ids: string[];
}

export interface AppliedDiscount {
  offer_ref: string;
  name: string;
  description: string | null;
  amount: number;
  qualifying_qty: number;
}

// Module-level cache — offers change weekly; 10 minutes is plenty fresh.
let cached: ActiveDeal[] | null = null;
let cachedAt = 0;
const CACHE_MS = 10 * 60 * 1000;

export async function fetchActiveDeals(): Promise<ActiveDeal[]> {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  try {
    const res = await fetch(
      'https://api.freshop.ncrcloud.com/1/offers?app_key=sinclair&is_clippable=true&limit=300&store_id=4297',
      { cache: 'no-store', headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return cached ?? [];
    const data = await res.json();
    const items: any[] = data?.items || [];
    const deals: ActiveDeal[] = [];
    for (const o of items) {
      const cfg = o?.config;
      const amount = Number(cfg?.price_off);
      const productIds: string[] = Array.isArray(o?.product_ids) ? o.product_ids.map(String) : [];
      // Only offers we can evaluate exactly: dollars-off with a product list.
      if (cfg?.type !== 'price_off_total' || !isFinite(amount) || amount <= 0 || productIds.length === 0) continue;
      deals.push({
        id: String(o.id),
        name: o.name || `${amount.toFixed(2)} off`,
        description: o.description || null,
        brand: o.brand || null,
        amount: Math.round(amount * 100) / 100,
        min_qty: Math.max(1, Number(cfg?.quantity_minimum) || 1),
        redemption_limit: Math.max(1, Number(o?.redemption_limit) || 1),
        finish_date: o.finish_date || null,
        freshop_product_ids: productIds,
      });
    }
    cached = deals;
    cachedAt = Date.now();
    return deals;
  } catch {
    return cached ?? [];
  }
}

export interface DiscountableLine {
  freshop_id: string | null;
  quantity: number;
  paid_by?: 'vessel' | 'cod';
}

/**
 * Evaluate which coupons an order qualifies for.
 * COD lines are excluded — Sinclair's rings those separately at the register,
 * so they can't help the company invoice qualify.
 */
export function computeDiscounts(lines: DiscountableLine[], deals: ActiveDeal[]): AppliedDiscount[] {
  const applied: AppliedDiscount[] = [];
  const vesselLines = lines.filter(l => l.paid_by !== 'cod' && l.freshop_id);
  if (!vesselLines.length) return applied;

  for (const deal of deals) {
    const idSet = new Set(deal.freshop_product_ids);
    const qty = vesselLines
      .filter(l => idSet.has(String(l.freshop_id)))
      .reduce((s, l) => s + l.quantity, 0);
    if (qty < deal.min_qty) continue;
    const redemptions = Math.min(deal.redemption_limit, Math.floor(qty / deal.min_qty));
    if (redemptions < 1) continue;
    applied.push({
      offer_ref: deal.id,
      name: deal.name,
      description: deal.description,
      amount: Math.round(deal.amount * redemptions * 100) / 100,
      qualifying_qty: qty,
    });
  }
  return applied;
}
