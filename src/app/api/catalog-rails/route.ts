// src/app/api/catalog-rails/route.ts
//
// The two rails, resolved to full product rows, for /catalog.
//
// Reads our own database — never Freshop. The nightly cron owns the third-party
// call, so a slow or throttled Freshop can't stall the page a crew orders from
// on one bar of signal.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { applyEffectiveCatalogPricing } from '@/lib/catalog-price';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();

  // ⚠️ SELECT * ON PURPOSE.
  //
  // This used to name its columns and fall back to a shorter list when the
  // query errored, which meant every new settings column needed a third
  // hand-maintained variant of the same query. Selecting the row and reading
  // what is there degrades by itself: a database missing 089's columns simply
  // has undefined for them, and the defaults below carry it.
  const { data: settings } = await supabase
    .from('admin_settings')
    .select('*')
    .single<Record<string, boolean | number | string | null>>();

  const flag = (key: string, fallback: boolean): boolean => {
    const v = settings?.[key];
    return typeof v === 'boolean' ? v : fallback;
  };

  // ── TWO ANSWERS, BOTH REQUIRED ────────────────────────────────
  //
  // show_*        — a person at GTS or Sinclair's decided. Always wins.
  // *_available   — the nightly cron's report on whether Sinclair's is running
  //                 this rail at all (089). Defaults to true so a database
  //                 without 089, or one whose cron has not run yet, behaves
  //                 exactly as it did before.
  //
  // A rail needs both. Neither is allowed to quietly turn the other back on.
  const showSale = flag('show_sale_rail', false) && flag('sale_rail_available', true);
  const showBest = flag('show_best_sellers_rail', true) && flag('best_sellers_rail_available', true);
  const showBoats = flag('show_boats_ordering_rail', false);

  if (!showSale && !showBest && !showBoats) {
    return NextResponse.json({ on_sale: [], best_sellers: [], boats_ordering: [] });
  }

  const wanted = [
    ...(showSale ? ['on_sale'] : []),
    ...(showBest ? ['best_sellers'] : []),
    ...(showBoats ? ['boats_ordering'] : []),
  ];

  const { data, error } = await supabase
    .from('catalog_rails')
    .select(`
      rail, position, sale_price, regular_price,
      product:products!inner (
        id, description, details, upc, category, pkg_size, uom, price, regular_price,
        sale_start_date, sale_finish_date, image_url,
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

  const rails: Record<string, unknown[]> = { on_sale: [], best_sellers: [], boats_ordering: [] };

  for (const r of (data || []) as unknown as Row[]) {
    // A product deactivated since the nightly run — pulled from sale, out of
    // season, disabled by an admin. The rail row still exists but the card
    // must not: adding it to a cart would fail at checkout.
    if (!r.product || r.product.is_active === false || r.product.is_available === false) continue;

    const product = applyEffectiveCatalogPricing(r.product as {
      price?: number | null; regular_price?: number | null;
      sale_start_date?: string | null; sale_finish_date?: string | null;
    });

    // Drop expired / not-yet-started sales from the on_sale rail even when the
    // nightly Freshop snapshot is stale.
    if (r.rail === 'on_sale' && !product.onSale) continue;

    rails[r.rail]?.push({
      ...product,
      rail_sale_price: product.onSale ? product.price : null,
      rail_regular_price: product.onSale ? product.regular_price : null,
    });
  }

  return NextResponse.json(rails, {
    // Five minutes. The underlying data changes once a night, so this is
    // really about not hammering the database when a boat reloads the
    // catalogue repeatedly on a flaky connection.
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
}
