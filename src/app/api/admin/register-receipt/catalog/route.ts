// src/app/api/admin/register-receipt/catalog/route.ts
//
// Lean UPC catalog for Sinclair REGISTER receipt matching.
// Includes store_only rows (full store) — catalog-sheet deliberately does not.
// Keep payload thin: id, upc, description, price. No images.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';

/** One literal — supabase-js infers row shape from the select string. */
const COLUMNS = 'id, upc, description, price';

const PAGE = 1000;

export async function GET(req: NextRequest) {
  // Same audience as catalog-sheet: any signed-in staff (GTS + Sinclair's).
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();
  const items: { id: string; upc: string; description: string; price: number }[] = [];

  for (let from = 0; from < 50000; from += PAGE) {
    const to = from + PAGE - 1;
    const { data, error } = await supabase
      .from('products')
      .select(COLUMNS)
      .eq('is_active', true)
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
        price: Number(r.price) || 0,
      });
    }
    if (rows.length < PAGE) break;
  }

  return NextResponse.json({ items, count: items.length });
}
