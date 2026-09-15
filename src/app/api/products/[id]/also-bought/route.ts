// src/app/api/products/[id]/also-bought/route.ts
//
// Product-modal row: "Boats buying this also buy" when we have
// basket co-occurrence; otherwise Sinclair's popularity rank (same as their
// own product pages) so the row is never empty on day one.
//
// Boat pairs = DISTINCT grocery orders in 90 days that contained both SKUs.
// Sinclair fill is the old behaviour and stays until co-occurrence is rich.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { Product } from '@/types';
import { applyEffectiveCatalogPricing } from '@/lib/catalog-price';
import { excludeHotPrepared } from '@/lib/catalog-exclusions';
import { fetchBoatsAlsoBought } from '@/lib/boats-ordering';

const LIMIT = 8;

const SELECT =
  'id, category, sub_category, upc, description, details, image_url, location, ' +
  'location_seq, quantity_step, quantity_label, quantity_size_ratio, pkg_size, ' +
  'uom, price, regular_price, sale_start_date, sale_finish_date, tags, is_active, is_available, billed_by_weight, form_section, ' +
  'form_subsection, form_seq, store_only, freshop_id, popularity';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: seed } = await supabase
    .from('products')
    .select('id, category')
    .eq('id', id)
    .single();

  if (!seed) return NextResponse.json({ products: [], source: 'sinclair' });

  const picked = new Map<string, Product>();
  let boatCount = 0;

  const neighbours = await fetchBoatsAlsoBought(supabase, id, LIMIT);
  if (neighbours.length) {
    const { data: boatRows } = await excludeHotPrepared(
      supabase
        .from('products')
        .select(SELECT)
        .in('id', neighbours.map(n => n.product_id))
        .eq('is_active', true)
        .eq('is_available', true),
    );
    const byId = new Map(((boatRows || []) as unknown as Product[]).map(p => [p.id, p]));
    for (const n of neighbours) {
      const p = byId.get(n.product_id);
      if (!p || p.id === id) continue;
      picked.set(p.id, p);
      boatCount++;
      if (picked.size >= LIMIT) break;
    }
  }

  if (picked.size < LIMIT) {
    const { data: sameCat } = await excludeHotPrepared(
      supabase
        .from('products')
        .select(SELECT)
        .eq('category', seed.category)
        .eq('is_active', true)
        .eq('is_available', true)
        .not('popularity', 'is', null)
        .neq('id', id),
    )
      .order('popularity', { ascending: true })
      .limit(LIMIT);

    for (const p of (sameCat || []) as unknown as Product[]) {
      if (picked.size >= LIMIT) break;
      if (!picked.has(p.id)) picked.set(p.id, p);
    }
  }

  if (picked.size < LIMIT) {
    const { data: storeWide } = await excludeHotPrepared(
      supabase
        .from('products')
        .select(SELECT)
        .eq('is_active', true)
        .eq('is_available', true)
        .not('popularity', 'is', null)
        .neq('id', id),
    )
      .order('popularity', { ascending: true })
      .limit(LIMIT * 3);

    for (const p of (storeWide || []) as unknown as Product[]) {
      if (picked.size >= LIMIT) break;
      if (!picked.has(p.id)) picked.set(p.id, p);
    }
  }

  const products = Array.from(picked.values()).slice(0, LIMIT).map(p =>
    applyEffectiveCatalogPricing(p),
  );
  const source = boatCount === 0
    ? 'sinclair'
    : boatCount >= products.length ? 'boats' : 'mixed';

  return NextResponse.json({ products, source });
}
