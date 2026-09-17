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
import { loadProductIndex, matchProduct } from '@/lib/product-index';
import { getAdminSession } from '@/lib/admin-auth-server';
import { refreshBoatsOrderingRail } from '@/lib/boats-ordering';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * ⚠️ AN ADMIN SESSION COUNTS, AND IT HAS TO.
 *
 * This accepted only Vercel's cron header or the CRON_SECRET, which meant the
 * rails could be rebuilt exactly once a day at 5am and by nothing else. When
 * the Best Sellers rail was wrong, there was no way for anyone at GTS to fix
 * it — "Sync now" on the products page rebuilds the CATALOGUE, a different
 * route entirely, and never touched the rails. So the rail stayed wrong for a
 * day while it looked like the sync was ignoring it.
 *
 * Same gate the catalogue sync already uses. Rebuilding a rail is idempotent
 * and reads only Sinclair's public feed; there is nothing here to protect that
 * an admin session does not already cover.
 */
function authorised(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  if (getAdminSession(req)) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

// Same work either way — the cron GETs it, the dashboard POSTs it.
export async function POST(req: NextRequest) {
  return GET(req);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // ── EVERY PRODUCT WE STOCK, NOT THE FIRST THOUSAND ───────────────────
  //
  // ⚠️ THIS LINE USED TO BE A PLAIN `.select('id, freshop_id')`, AND THAT IS
  // THE WHOLE REASON THE RAIL NEVER MATCHED SINCLAIR'S.
  //
  // PostgREST caps an unbounded select at 1,000 rows. The catalogue is ~22,000.
  // So the lookup was the first thousand products in whatever order Postgres
  // returned them, with no error and no warning — and every best seller that
  // happened to live further down was dropped by the `we don't stock it` branch
  // below, which was asserting something untrue.
  //
  // Measured against the live store: Sinclair's top items are Yellow Bananas
  // (#1), Ground Beef (#4), Sweet Corn (#5), Eggs (#6), Mac & Cheese (#7),
  // Calhoun Peaches and Russet Potato (#11). Ours showed the beef and the
  // peaches. The query asking Freshop for the right products was fixed; the
  // query asking OUR OWN DATABASE which of them we carry was not.
  let index;
  try {
    index = await loadProductIndex(supabase, { activeOnly: true, excludeHotPrepared: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not load the catalogue' },
      { status: 500 },
    );
  }

  /** Freshop ids we resolved only by barcode — written back after the rails. */
  const learned = new Map<string, string>();
  const matchStats = { freshop_id: 0, upc: 0, unmatched: 0 };
  const unmatchedNames: string[] = [];

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
        // Freshop id first, barcode second. The second is what rescues an item
        // the enrich step has not linked yet; see lib/product-index for why
        // there is deliberately no name match.
        const hit = matchProduct(index, {
          id: it.freshopId,
          upc: it.upc,
          barcode_upc_a: it.barcode_upc_a,
          barcode_ean13: it.barcode_ean13,
        });
        if (!hit) {
          matchStats.unmatched++;
          if (unmatchedNames.length < 15) unmatchedNames.push(it.freshopId);
          return null;               // genuinely not in the catalogue
        }
        matchStats[hit.by]++;
        // Matched on a barcode, so our row is missing the id. Recorded now and
        // written back below, which makes tonight's rescue permanent instead of
        // a lookup we repeat every night for ever.
        if (hit.by === 'upc') learned.set(hit.productId, it.freshopId);
        const productId = hit.productId;
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

    // ── TEACH THE CATALOGUE WHAT WE LEARNED ──────────────────────────
    //
    // Anything matched by barcode has a row with no freshop_id on it, which is
    // an enrich gap this rail just happened to close. Writing it back makes
    // tonight's rescue permanent: tomorrow it is an exact id match here, and
    // the deals matcher and the nightly enrich get it for free.
    //
    // One row at a time and every failure swallowed — this is a bonus, and it
    // must never be the reason a rail build reports failure.
    for (const [productId, freshopId] of learned) {
      const { error: learnErr } = await supabase
        .from('products')
        .update({ freshop_id: freshopId })
        .eq('id', productId)
        .is('freshop_id', null);
      if (learnErr) console.warn('[catalog-rails] freshop_id not written back:', learnErr.message);
    }

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

  // Said out loud so a rail that is short can be diagnosed from the cron's own
  // response instead of by staring at the storefront and guessing. `catalog`
  // is the number the 1,000-row cap used to hide.
  return NextResponse.json({
    ok: true,
    ...result,
    catalog: index.count,
    matched: matchStats,
    learned_freshop_ids: learned.size,
    ...(unmatchedNames.length ? { unmatched_freshop_ids: unmatchedNames } : {}),
  });
}
