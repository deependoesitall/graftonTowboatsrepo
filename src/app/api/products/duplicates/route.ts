// src/app/api/products/duplicates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

// Returns groups of products that look like duplicates of each other:
//  - same UPC (when UPC present), or
//  - same description + pkg_size (regardless of price)
// Each group includes all member products so the admin can compare price,
// status, etc. and decide what to keep.
export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: false });
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();

  const { data: products, error } = await supabase
    .from('products')
    .select('id, category, sub_category, upc, description, pkg_size, uom, price, is_active, is_available, created_at')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byUpc = new Map<string, any[]>();
  const byDescPkg = new Map<string, any[]>();

  for (const p of products || []) {
    if (p.upc && p.upc.trim()) {
      const key = `upc:${p.upc.trim()}`;
      if (!byUpc.has(key)) byUpc.set(key, []);
      byUpc.get(key)!.push(p);
    }
    const dpKey = `dp:${(p.description || '').trim().toUpperCase()}|${(p.pkg_size || '').trim().toUpperCase()}`;
    if (!byDescPkg.has(dpKey)) byDescPkg.set(dpKey, []);
    byDescPkg.get(dpKey)!.push(p);
  }

  const groups: { key: string; type: 'upc' | 'name_pack'; items: any[] }[] = [];
  const seenIds = new Set<string>();

  for (const [key, items] of byUpc) {
    if (items.length > 1) {
      groups.push({ key, type: 'upc', items });
      items.forEach(i => seenIds.add(i.id));
    }
  }
  for (const [key, items] of byDescPkg) {
    if (items.length > 1) {
      // Avoid double-reporting groups already fully captured by a UPC group
      const allSeen = items.every(i => seenIds.has(i.id));
      if (allSeen) continue;
      groups.push({ key, type: 'name_pack', items });
    }
  }

  // Sort groups by size descending, largest duplicate clusters first
  groups.sort((a, b) => b.items.length - a.items.length);

  return NextResponse.json({
    groups,
    total_groups: groups.length,
    total_duplicate_items: groups.reduce((sum, g) => sum + g.items.length, 0),
  });
}
