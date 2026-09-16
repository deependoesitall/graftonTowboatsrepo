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
import { buildBestSellers, buildOnSale, MIN_SALE_UPSTREAM, type RailBuild } from '@/lib/catalog-rails';
import { excludeHotPrepared } from '@/lib/catalog-exclusions';
import { refreshBoatsOrderingRail } from '@/lib/boats-ordering';

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
  const { data: products, error: pErr } = await excludeHotPrepared(
    supabase
    .from('products')
    .select('id, freshop_id')
    .not('freshop_id', 'is', null)
    .eq('is_active', true),
  );

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const byFreshop = new Map<string, string>();
  for (const p of products || []) {
    // First wins. Size variants share a Freshop id in a few cases and the rail
    // only needs one card — the grouped product card handles sizes itself.
    if (p.freshop_id && !byFreshop.has(p.freshop_id)) byFreshop.set(p.freshop_id, p.id);
  }

  const result: Record<string, { found: number; skipped: number; error?: string }> = {};

  // What Sinclair's is publishing right now, recorded so the read path and the
  // admin panel can both see it. See migration 089.
  const availability: Record<string, unknown> = { rails_checked_at: new Date().toISOString() };

  async function writeRail(rail: 'best_sellers' | 'on_sale', build: RailBuild) {
    const { items, upstream, incomplete } = build;

    // ── IS SINCLAIR'S RUNNING THIS RAIL AT ALL? ──────────────────────
    //
    // Asked of THEIR set size, before our filters, and never asked at all when
    // the fetch was incomplete — a Freshop timeout must not read as "they
    // cancelled the sale". On an incomplete run the previous answer stands.
    if (rail === 'on_sale' && !incomplete) {
      const live = upstream >= MIN_SALE_UPSTREAM;
      availability.sale_rail_available = live;
      availability.sale_rail_upstream_count = upstream;

      // ⚠️ THE ONE CASE WHERE WIPING THE RAIL IS CORRECT.
      //
      // Everywhere else this file refuses to clear a rail it cannot rebuild,
      // because a day stale beats a day empty. Not here: if Sinclair's has
      // taken their sale row down, ours is last week's prices under a heading
      // that says "on sale", and a crew ordering against those gets a register
      // total that does not match. Stale is worse than empty exactly once, and
      // this is it.
      if (!live) {
        await supabase.from('catalog_rails').delete().eq('rail', rail);
        result[rail] = { found: 0, skipped: items.length, error: 'Sinclair\u2019s has no sale week running' };
        return;
      }
    }

    if (rail === 'best_sellers' && !incomplete) {
      availability.best_sellers_rail_available = items.length > 0;
    }

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
    const boats = await refreshBoatsOrderingRail(supabase);
    result.boats_ordering = { found: boats.wrote, skipped: 0, error: boats.error };

    // Availability last, so a build that threw leaves yesterday's answer in
    // place rather than half of today's.
    const { data: settingsRow } = await supabase
      .from('admin_settings')
      .select('id')
      .single();
    const { error: availErr } = settingsRow
      ? await supabase.from('admin_settings').update(availability).eq('id', settingsRow.id)
      : { error: { message: 'no admin_settings row' } };
    // Pre-089 databases have none of these columns. That is not a failure —
    // the read path defaults them to true, which is the old behaviour.
    if (availErr) console.warn('[catalog-rails] availability not recorded:', availErr.message);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Rail build failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
