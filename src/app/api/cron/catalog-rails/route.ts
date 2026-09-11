// src/app/api/cron/catalog-rails/route.ts
//
// Nightly rebuild of the two catalog rails.
//
// Runs after the catalog sync, because a rail can only point at SKUs we
// already hold — an item featured by Sinclair's that we haven't imported yet
// is skipped rather than stored as a dangling reference.
//
// ⚠️ OVERWRITES EACH RAIL WHOLE. Ended sales must disappear. Merging would
// leave last week's expired specials on the rail with a red price that no
// longer rings up, and the crew would order expecting it.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { buildBestSellers, buildOnSale, type RailItem } from '@/lib/catalog-rails';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Vercel signs its own cron invocations with this header.
  if (req.headers.get('x-vercel-cron')) return true;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Freshop id → our uuid. Built once and shared by both rails.
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, freshop_id')
    .not('freshop_id', 'is', null)
    .eq('is_active', true);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const byFreshop = new Map<string, string>();
  for (const p of products || []) {
    // First wins. Size variants share a Freshop id in a few cases and the rail
    // only needs one card — the grouped product card handles sizes itself.
    if (p.freshop_id && !byFreshop.has(p.freshop_id)) byFreshop.set(p.freshop_id, p.id);
  }

  const result: Record<string, { found: number; skipped: number }> = {};

  async function writeRail(rail: 'best_sellers' | 'on_sale', items: RailItem[]) {
    const rows = items
      .map(it => {
        const productId = byFreshop.get(it.freshopId);
        if (!productId) return null;   // we don't stock it — skip, don't store
        return {
          rail,
          product_id: productId,
          position: it.position,
          sale_price: it.salePrice,
          regular_price: it.regularPrice,
          refreshed_at: new Date().toISOString(),
        };
      })
      .filter(Boolean) as Record<string, unknown>[];

    // De-dupe on product_id: two Freshop ids can resolve to one SKU, and the
    // table's UNIQUE (rail, product_id) would reject the whole insert.
    const seen = new Set<string>();
    const unique = rows.filter(r => {
      const k = String(r.product_id);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // DELETE THEN INSERT, in that order, and only when we have something to
    // put back. An empty build — Freshop down, or a genuinely empty sale week
    // — must NOT wipe a working rail and leave the page blank. Better a day
    // stale than a day empty.
    if (unique.length === 0) {
      result[rail] = { found: 0, skipped: items.length };
      return;
    }

    await supabase.from('catalog_rails').delete().eq('rail', rail);
    const { error } = await supabase.from('catalog_rails').insert(unique);
    if (error) throw new Error(`${rail}: ${error.message}`);

    result[rail] = { found: unique.length, skipped: items.length - unique.length };
  }

  try {
    // Sequential, not parallel: two Freshop paginations at once is how you
    // trip their throttle and get half a rail.
    await writeRail('on_sale', await buildOnSale());
    await writeRail('best_sellers', await buildBestSellers());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Rail build failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
