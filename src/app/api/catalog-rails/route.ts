// src/app/api/catalog-rails/route.ts
//
// The two rails, resolved to full product rows, for /catalog.
//
// Reads our own database — never Freshop. The nightly cron owns the third-party
// call, so a slow or throttled Freshop can't stall the page a crew orders from
// on one bar of signal.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();

  const { data: settings } = await supabase
    .from('admin_settings')
    .select('show_sale_rail, show_best_sellers_rail')
    .single();

  // Default TRUE when the row or column is missing — matches the migration's
  // default, so the rails work before anyone visits Settings.
  const showSale = settings?.show_sale_rail ?? true;
  const showBest = settings?.show_best_sellers_rail ?? true;

  if (!showSale && !showBest) {
    return NextResponse.json({ on_sale: [], best_sellers: [] });
  }

  const wanted = [
    ...(showSale ? ['on_sale'] : []),
    ...(showBest ? ['best_sellers'] : []),
  ];

  const { data, error } = await supabase
    .from('catalog_rails')
    .select(`
      rail, position, sale_price, regular_price,
      product:products!inner (
        id, description, pkg_size, uom, price, image_url,
        billed_by_weight, quantity_step, quantity_label,
        is_active, is_available
      )
    `)
    .in('rail', wanted)
    .order('position', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    rail: string; position: number;
    sale_price: number | null; regular_price: number | null;
    product: Record<string, unknown> | null;
  };

  const rails: Record<string, unknown[]> = { on_sale: [], best_sellers: [] };

  for (const r of (data || []) as unknown as Row[]) {
    // A product deactivated since the nightly run — pulled from sale, out of
    // season, disabled by an admin. The rail row still exists but the card
    // must not: adding it to a cart would fail at checkout.
    if (!r.product || r.product.is_active === false || r.product.is_available === false) continue;

    rails[r.rail]?.push({
      ...r.product,
      rail_sale_price: r.sale_price,
      rail_regular_price: r.regular_price,
    });
  }

  return NextResponse.json(rails, {
    // Five minutes. The underlying data changes once a night, so this is
    // really about not hammering the database when a boat reloads the
    // catalogue repeatedly on a flaky connection.
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
}
