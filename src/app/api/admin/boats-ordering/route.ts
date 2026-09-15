// src/app/api/admin/boats-ordering/route.ts
// Admin preview of the silent "See What Boats Are Buying" ranking.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import {
  fetchBoatsOrderingRank, fetchBoatsOrderingStats, refreshBoatsOrderingRail,
  BOATS_ORDERING_LIVE_ORDERS, BOATS_ORDERING_LIVE_BOATS, BOATS_ORDERING_MIN_CARDS,
} from '@/lib/boats-ordering';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'settings' });
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();
  try {
    const [stats, ranked] = await Promise.all([
      fetchBoatsOrderingStats(supabase),
      fetchBoatsOrderingRank(supabase, 12),
    ]);

    const ids = ranked.map(r => r.product_id);
    let products: Array<{ id: string; description: string; image_url: string | null; price: number | null }> = [];
    if (ids.length) {
      const { data } = await supabase
        .from('products')
        .select('id, description, image_url, price')
        .in('id', ids);
      products = (data || []) as typeof products;
    }
    const byId = new Map(products.map(p => [p.id, p]));

    return NextResponse.json({
      stats,
      thresholds: {
        grocery_orders: BOATS_ORDERING_LIVE_ORDERS,
        distinct_boats: BOATS_ORDERING_LIVE_BOATS,
        cards: BOATS_ORDERING_MIN_CARDS,
      },
      items: ranked.map(r => {
        const p = byId.get(r.product_id);
        return {
          ...r,
          description: p?.description || 'Unknown item',
          image_url: p?.image_url ?? null,
          price: p?.price ?? null,
        };
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ranking unavailable — run migration 086?' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'settings' });
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();
  const result = await refreshBoatsOrderingRail(supabase);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, wrote: result.wrote });
}
