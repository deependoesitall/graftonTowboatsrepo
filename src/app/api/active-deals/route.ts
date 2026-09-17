// src/app/api/active-deals/route.ts
// Active digital coupons mapped to OUR product ids — used by the checkout to
// preview savings live as the cart changes. The server recomputes and
// snapshots authoritative amounts at order submission, so this endpoint is
// display-only. Gated on the Sinclair manager's show_digital_coupons toggle:
// off means no deals shown AND none applied.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchActiveDeals } from '@/lib/sinclair-offers';
import { loadProductIndex } from '@/lib/product-index';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();
  const { data: settings } = await supabase
    .from('admin_settings')
    .select('show_digital_coupons')
    .single();
  if (!(settings?.show_digital_coupons ?? true)) {
    return NextResponse.json({ deals: [] });
  }

  // ⚠️ THIS WAS `.select('id, freshop_id')` WITH NO RANGE, AND IT WAS HIDING
  // MOST OF THE COUPONS.
  //
  // PostgREST caps an unbounded select at 1,000 rows and the catalogue is
  // ~22,000, so the map was the first thousand products in arbitrary order. A
  // deal on anything further down resolved to no product ids and was dropped
  // by the `.filter(d => d.product_ids.length > 0)` below — silently, because
  // a coupon that matches nothing looks exactly like a coupon that has expired.
  //
  // Same one-line mistake as the Best Sellers rail; see lib/product-index.
  const [deals, index] = await Promise.all([
    fetchActiveDeals(),
    loadProductIndex(supabase),
  ]);
  const byFreshop = index.byFreshop;

  const mapped = deals
    .map(d => ({
      id: d.id,
      name: d.name,
      description: d.description,
      amount: d.amount,
      min_qty: d.min_qty,
      redemption_limit: d.redemption_limit,
      product_ids: d.freshop_product_ids.flatMap(fid => byFreshop.get(fid) || []),
    }))
    .filter(d => d.product_ids.length > 0);

  return NextResponse.json(
    { deals: mapped },
    { headers: { 'Cache-Control': 'public, max-age=300' } }
  );
}
