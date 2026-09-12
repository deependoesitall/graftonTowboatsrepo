// src/app/api/admin/register-receipt/catalog/route.ts
//
// Lean UPC catalog for Sinclair REGISTER receipt matching.
// Includes store_only rows (full store) — catalog-sheet deliberately does not.
// Keep payload thin: id, upc, description, price. No images.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { effectiveCatalogPrice } from '@/lib/catalog-price';

export const dynamic = 'force-dynamic';

/** One literal — supabase-js infers row shape from the select string. */
const COLUMNS = 'id, upc, description, price, regular_price, sale_start_date, sale_finish_date, is_active, category, pkg_size, uom, image_url';

const PAGE = 1000;

export async function GET(req: NextRequest) {
  // Same audience as catalog-sheet: any signed-in staff (GTS + Sinclair's).
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();
  const items: {
    id: string; upc: string; description: string; price: number; is_active: boolean;
    category: string | null; pkg_size: string | null; uom: string | null; image_url: string | null;
  }[] = [];

  for (let from = 0; from < 50000; from += PAGE) {
    const to = from + PAGE - 1;
    // Include inactive rows: register tapes often ring UPCs we later delisted
    // (e.g. Wright's bacon 7962146100 still sells on tape but is_active=false).
    const { data, error } = await supabase
      .from('products')
      .select(COLUMNS)
      .not('upc', 'is', null)
      .neq('upc', '')
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('register-receipt catalog error:', error);
      return NextResponse.json({ error: 'Could not load the UPC catalog.' }, { status: 500 });
    }
    const rows = data || [];
    for (const r of rows) {
      const upc = String(r.upc || '').trim();
      if (!upc) continue;
      items.push({
        id: r.id,
        upc,
        description: r.description || '',
        price: effectiveCatalogPrice(r).price,
        is_active: r.is_active !== false,
        category: r.category || null,
        pkg_size: r.pkg_size || null,
        uom: r.uom || null,
        image_url: r.image_url || null,
      });
    }
    if (rows.length < PAGE) break;
  }

  return NextResponse.json({ items, count: items.length });
}
