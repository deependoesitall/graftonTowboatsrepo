// src/app/api/products/[id]/also-bought/route.ts
//
// "People who bought this also bought" — the same row Sinclair's shows on
// their own product pages.
//
// HOW SINCLAIR'S DOES IT (probed live against the Freshop API, July 2026):
// Freshop stamps every product with a store-wide `popularity` RANK (1 = most
// popular) and their storefront's default sort IS that rank. The row on a
// Sinclair's product page is the store's popular staples — milk, eggs, sugar,
// tomatoes — not a per-product co-occurrence model. We reproduce it from the
// popularity we already sync nightly, so it's real Sinclair's data with no
// cold-start problem and no admin curation.
//
// Ordering: same-category popular items first (a produce item surfaces produce
// neighbours, like Sinclair's banana page did), then store-wide staples to
// fill out the row.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

const LIMIT = 8;

const SELECT =
  'id, category, sub_category, upc, description, details, image_url, location, ' +
  'location_seq, quantity_step, quantity_label, quantity_size_ratio, pkg_size, ' +
  'uom, price, tags, is_active, is_available, billed_by_weight, form_section, ' +
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

  if (!seed) return NextResponse.json({ products: [] });

  const picked = new Map<string, Record<string, unknown>>();

  // Pass 1 — popular items in the SAME category as the product being viewed.
  const { data: sameCat } = await supabase
    .from('products')
    .select(SELECT)
    .eq('category', seed.category)
    .eq('is_active', true)
    .eq('is_available', true)
    .not('popularity', 'is', null)
    .neq('id', id)
    .order('popularity', { ascending: true })
    .limit(LIMIT);

  for (const p of sameCat || []) picked.set(p.id as string, p);

  // Pass 2 — store-wide staples fill any remaining slots.
  if (picked.size < LIMIT) {
    const { data: storeWide } = await supabase
      .from('products')
      .select(SELECT)
      .eq('is_active', true)
      .eq('is_available', true)
      .not('popularity', 'is', null)
      .neq('id', id)
      .order('popularity', { ascending: true })
      .limit(LIMIT * 3);

    for (const p of storeWide || []) {
      if (picked.size >= LIMIT) break;
      if (!picked.has(p.id as string)) picked.set(p.id as string, p);
    }
  }

  return NextResponse.json({ products: Array.from(picked.values()).slice(0, LIMIT) });
}
