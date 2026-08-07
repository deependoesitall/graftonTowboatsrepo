// src/app/api/search-index/route.ts
// The barge order form as a compact, cacheable search index.
//
// Crews order from boats on the river with weak signal, so the ~1,100-item
// order form ships to the device ONCE and every search after that is answered
// locally — instant, and it survives a dropped connection mid-order. Only the
// fields needed to search and render a product card are included, which keeps
// the payload small (tens of KB gzipped).
//
// The full ~20k-item store is deliberately NOT here — that stays server-side
// search, since shipping it to a phone on cell data would defeat the purpose.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Re-fetched at most every 10 minutes; the browser also caches it per session.
export const revalidate = 600;

const FIELDS = [
  'id', 'description', 'details', 'category', 'sub_category', 'pkg_size',
  'uom', 'price', 'image_url', 'upc', 'billed_by_weight', 'quantity_step',
  'quantity_label', 'quantity_size_ratio', 'popularity',
  // Extra searchable signal: admin tags + the paper form's own groupings
  // ("Meat" / "Beef"), which are natural keywords crews already think in.
  'tags', 'form_section', 'form_subsection',
].join(', ');

export async function GET() {
  const supabase = await createClient();

  const products: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select(FIELDS)
      .eq('is_active', true)
      .eq('is_available', true)
      .eq('store_only', false)          // barge order form only
      .order('form_seq', { ascending: true, nullsFirst: false })
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    products.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  return NextResponse.json(
    { products, generated_at: new Date().toISOString() },
    {
      headers: {
        // Cache hard at the edge + on device; a stale index for a few minutes
        // is far better than a slow search on a boat.
        'Cache-Control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=86400',
      },
    },
  );
}
