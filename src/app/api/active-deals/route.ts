// src/app/api/active-deals/route.ts
// Active digital coupons mapped to OUR product ids — used by the checkout to
// preview savings live as the cart changes. The server recomputes and
// snapshots authoritative amounts at order submission, so this endpoint is
// display-only. Gated on the Sinclair manager's show_digital_coupons toggle:
// off means no deals shown AND none applied.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchActiveDeals } from '@/lib/sinclair-offers';

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

  const [deals, { data: products }] = await Promise.all([
    fetchActiveDeals(),
    supabase.from('products').select('id, freshop_id').not('freshop_id', 'is', null),
  ]);

  // Sinclair product id → our product uuid(s)
  const byFreshop = new Map<string, string[]>();
  (products || []).forEach((p: { id: string; freshop_id: string | null }) => {
    if (!p.freshop_id) return;
    if (!byFreshop.has(p.freshop_id)) byFreshop.set(p.freshop_id, []);
    byFreshop.get(p.freshop_id)!.push(p.id);
  });

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
