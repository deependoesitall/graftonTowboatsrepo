// src/app/api/products/duplicates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

// Returns groups of products that look like duplicates of each other:
//  - 'upc': same UPC AND same description (true duplicates — safe to merge/delete)
//  - 'name_pack': same description + pkg_size + price (true duplicates)
//  - 'upc_conflict': same UPC but DIFFERENT description (e.g. Sinclair reuses
//    one UPC across flavor variants like Blue Bell ice cream, or placeholder
//    UPCs like "BAKERY"/"FAMOUS"). These are NOT duplicates of each other —
//    shown for awareness only and excluded from "Delete All Duplicates".
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
  const byDescPkgPrice = new Map<string, any[]>();

  for (const p of products || []) {
    if (p.upc && p.upc.trim()) {
      const key = `upc:${p.upc.trim()}`;
      if (!byUpc.has(key)) byUpc.set(key, []);
      byUpc.get(key)!.push(p);
    }
    const dpKey = `dpp:${(p.description || '').trim().toUpperCase()}|${(p.pkg_size || '').trim().toUpperCase()}|${Number(p.price)}`;
    if (!byDescPkgPrice.has(dpKey)) byDescPkgPrice.set(dpKey, []);
    byDescPkgPrice.get(dpKey)!.push(p);
  }

  const groups: { key: string; type: 'upc' | 'name_pack' | 'upc_conflict'; items: any[] }[] = [];
  const seenIds = new Set<string>();

  for (const [key, items] of byUpc) {
    if (items.length <= 1) continue;
    // Split into sub-groups by identical description — only items sharing
    // BOTH the UPC and the description are true duplicates.
    const byDesc = new Map<string, any[]>();
    for (const item of items) {
      const dKey = (item.description || '').trim().toUpperCase();
      if (!byDesc.has(dKey)) byDesc.set(dKey, []);
      byDesc.get(dKey)!.push(item);
    }
    const descGroups = Array.from(byDesc.values());
    if (descGroups.length === 1) {
      // All items with this UPC share the same description — true duplicates.
      groups.push({ key, type: 'upc', items });
      items.forEach(i => seenIds.add(i.id));
    } else {
      // Same UPC, different products — likely a reused/placeholder UPC.
      // Surface for awareness but don't mark as duplicates to delete.
      groups.push({ key, type: 'upc_conflict', items });
    }
  }

  for (const [key, items] of byDescPkgPrice) {
    if (items.length > 1) {
      // Avoid double-reporting groups already fully captured by a UPC group
      const allSeen = items.every(i => seenIds.has(i.id));
      if (allSeen) continue;
      groups.push({ key, type: 'name_pack', items });
      items.forEach(i => seenIds.add(i.id));
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
