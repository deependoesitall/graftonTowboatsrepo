// src/app/api/cron/catalog-sync/route.ts
// Hands-free nightly catalog sync — replaces clicking "Enrich from Sinclair's"
// and "Apply Order-Form Layout" in the admin panel.
//
// NCR/Freshop rate-limits datacenter IPs (a single-shot server sync was tried
// and abandoned long ago), so this works in SMALL CHUNKS: each invocation
// downloads a handful of catalog pages, applies field updates in one bulk RPC,
// and checkpoints progress in catalog_sync_state. Repeated invocations across
// the night (Vercel cron kick-off + GitHub Actions every 15 min) finish the
// whole catalog; the LAST chunk re-applies the order-form layout and writes
// one activity-log entry.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel cron sends this
// automatically when the env var is set; the GitHub Action sends it manually).
// A valid admin session also works, so it can be triggered by hand for testing.

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAdminSession } from '@/lib/admin-auth-server';
import { applyFormLayout } from '@/lib/form-layout-apply';
import { findMatchFor } from '@/lib/image-backfill';
import {
  fetchFreshopPages, fetchFreshopTotal, freshopKeys, ourKeys, computeFields,
  buildStoreProduct, norm,
  FRESHOP_PAGE_SIZE, FRESHOP_DEPARTMENTS,
  type FreshopProduct, type SyncableProduct, type SyncStats,
} from '@/lib/freshop-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Throughput: fetch pages in small CONCURRENT batches instead of a serial
// crawl. The old pacing (1 page every 1.2s) spent ~15s of every 40s budget
// asleep and needed ~17 invocations for the full store. Batches of 4 with a
// short breath between them clear the same ground in a fraction of the runs
// while staying well inside what NCR tolerates.
const BATCH_SIZE = 4;               // concurrent page fetches
const PAGES_PER_RUN = 40;           // per invocation (~10 batches)
const BATCH_DELAY_MS = 250;         // breath between batches
const TIME_BUDGET_MS = 45_000;      // leave headroom under maxDuration
const MAX_DEPT_PAGES = 500;         // runaway guard for page-until-empty growth

interface DeptProgress {
  id: string;
  name: string;
  category: string;
  total: number;
  pages: number;
  done: number[];
}

interface SyncState {
  day?: string;                     // date the current sync session STARTED (America/Chicago)
  /** Per-department progress — departments are fetched separately so alcohol
   * is never requested and category mapping is authoritative. */
  depts?: DeptProgress[];
  stats?: SyncStats;
  applied?: number;
  /** New store items inserted this session (full-store import). */
  inserted?: number;
  completedAt?: string;
  lastError?: string;
  /** Result of the end-of-sweep store reconcile (see reconcile_store_availability). */
  reconcile?: {
    skipped: boolean; reason?: string;
    hidden?: number; restored?: number; would_hide?: number;
    total?: number; pct?: number;
  };
}

const emptyStats = (): SyncStats =>
  ({ matched: 0, images: 0, details: 0, weightFlags: 0, locations: 0, prices: 0 });

function chicagoDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Duplicate identity (mirrors migration 054's SQL functions exactly) ──
// Sinclair's carries the same product under two Freshop entries with different
// wording — "BLACKBERRIES 6 OZ" vs "BLACKBERRY 6 OZ", and worse, sometimes with
// the size in pkg_size and sometimes baked into the name. Both have to be
// normalized or the pair slips through and re-inserts every night.
const SIZE_UNITS =
  String.raw`ounces?|oz|pounds?|lbs?|counts?|ct|packs?|pk|pints?|pt|quarts?|qt|gallons?|gal|liters?|litres?|milliliters?|ml|kilograms?|kg|grams?|g|inches|inch|in|dozen|doz|dz|l`;
const SIZE_SUFFIX_RE =
  new RegExp(String.raw`[\s(\[]*(\d+(?:\.\d+)?\s*-?\s*(?:${SIZE_UNITS}))\.?\s*[)\]]?\s*$`, 'i');

// "1 GALLON" and "1 gal" are the same size — canonicalize the unit, don't just
// strip punctuation. Mirrors the CASE block in migration 054.
const UNIT_CANON: Record<string, string> = {};
for (const [canon, spellings] of [
  ['oz', ['oz', 'ounce', 'ounces']], ['lb', ['lb', 'lbs', 'pound', 'pounds']],
  ['gal', ['gal', 'gallon', 'gallons']], ['pt', ['pt', 'pint', 'pints']],
  ['qt', ['qt', 'quart', 'quarts']], ['ml', ['ml', 'milliliter', 'milliliters']],
  ['l', ['l', 'liter', 'liters', 'litre', 'litres']], ['kg', ['kg', 'kilogram', 'kilograms']],
  ['g', ['g', 'gram', 'grams']], ['ct', ['ct', 'cnt', 'count', 'counts']],
  ['pk', ['pk', 'pkg', 'pack', 'packs']], ['in', ['in', 'inch', 'inches']],
  ['dz', ['dz', 'doz', 'dozen']], ['ea', ['ea', 'each']],
] as Array<[string, string[]]>) for (const s of spellings) UNIT_CANON[s] = canon;

function sizeToken(rs: string): string {
  const m = (rs || '').toLowerCase().match(/(\d+(?:\.\d+)?)[^a-z0-9]*([a-z]+)?/);
  if (!m) {
    // No number at all. "each" is not a size, so it must read the same as a
    // blank pkg_size or "BANANAS" and "Banana (each)" stay split forever.
    const plain = (rs || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return plain === 'each' || plain === 'ea' ? '' : plain;
  }
  const unit = m[2] || '';
  return m[1] + (UNIT_CANON[unit] ?? unit);
}

/** name|size identity: plural/case/punctuation-insensitive name, plus the size
 *  from pkg_size — falling back to whatever was baked into the name. */
function productMatchKey(name: string, size: string): string {
  const raw = name || '';
  const base = raw.replace(SIZE_SUFFIX_RE, '');
  const nameKey = (base.trim() === '' ? raw : base)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/ies/g, 'y')
    .replace(/s$/, '');
  const rs = size.trim() || raw.match(SIZE_SUFFIX_RE)?.[1] || '';
  return `${nameKey}|${sizeToken(rs)}`;
}

async function handle(req: NextRequest) {
  // ── Auth: cron secret or admin session ──
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  const bearerOk = !!secret && auth === `Bearer ${secret}`;
  const adminOk = !!getAdminSession(req);
  if (!bearerOk && !adminOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const supabase = createServiceClient();
  const today = chicagoDay();

  // ── Load checkpoint ──
  const { data: row } = await supabase.from('catalog_sync_state').select('state').eq('id', 1).single();
  let state: SyncState = (row?.state as SyncState) || {};

  // Session logic: an UNFINISHED session continues across days (the very first
  // full-store sweep can span multiple nights). A COMPLETED session starts
  // fresh on the next new day; completed-today invocations are no-ops.
  if (state.completedAt) {
    if (state.day === today) {
      // Catalog sweep is done for today — but keep clearing the photo-match
      // backlog and self-chain until it's empty, so Photo Review fills up in
      // ONE night instead of only during the sweep's handful of runs.
      const selfUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_APP_URL;
      let backfill = { processed: 0, hasMore: false };
      try { backfill = await runPhotoBackfill(supabase, started + TIME_BUDGET_MS - 5000); } catch { /* never break */ }
      if (backfill.hasMore) chainSelf(secret, selfUrl);
      return NextResponse.json({
        status: 'done', day: today, completedAt: state.completedAt,
        stats: state.stats, inserted: state.inserted || 0,
        photo_backfill: backfill, has_more: backfill.hasMore,
      });
    }
    state = { day: today, stats: emptyStats(), applied: 0, inserted: 0 };
  } else if (!state.day || !state.depts) {
    // !state.depts also catches checkpoints from the pre-department layout —
    // they restart cleanly under the new per-department structure.
    state = { day: today, stats: emptyStats(), applied: 0, inserted: 0 };
  }

  // ── Discover per-department sizes once per session ──
  // Freshop's totals can wobble during their own nightly rebuild, so each
  // department's count is captured once at session start and held for the
  // whole session (progress math stays stable).
  if (!state.depts || state.depts.length === 0) {
    // Size departments SEQUENTIALLY, paced. This used to be a Promise.all —
    // eight simultaneous requests to an API this file already documents as
    // rate-limiting bursts. Throttled sizing answers come back short, and a
    // short size is silent: the sweep computes too few pages, imports a
    // fraction of the store, then reports itself complete. Observed live —
    // the store sized at 775 when Bakery alone reports 1,820.
    // Eight paced calls cost ~3s once per session. Worth every millisecond.
    const totals: Array<number | null> = [];
    for (const d of FRESHOP_DEPARTMENTS) {
      if (totals.length) await sleep(300);
      totals.push(await fetchFreshopTotal(d.id));
    }
    const missing = FRESHOP_DEPARTMENTS.filter((_, i) => totals[i] == null);
    if (missing.length) {
      state.lastError = `Freshop unreachable sizing ${missing.map(d => d.name).join(', ')} — will retry on next invocation`;
      await saveState(supabase, state);
      return NextResponse.json({ status: 'waiting', reason: state.lastError }, { status: 200 });
    }
    state.depts = FRESHOP_DEPARTMENTS.map((d, i) => ({
      id: d.id, name: d.name, category: d.category,
      total: totals[i]!, pages: Math.ceil(totals[i]! / FRESHOP_PAGE_SIZE), done: [],
    }));
  }

  // ── Load our catalog once per invocation ──
  // TWO loads, deliberately asymmetric:
  //  1. FULL syncable fields for the ~1,150 BARGE items (store_only = false).
  //     These are the curated order-form products we enrich every night.
  //  2. UPC ONLY for the ~20,700 store_only rows — they were inserted straight
  //     from Freshop and don't need re-enriching; we just need their UPCs so we
  //     never import the same item twice.
  // The old code pulled every field for all ~21,850 rows on EVERY invocation
  // (~22 round-trips of fat payload); this cuts that to ~2 thin ones.
  const ours: SyncableProduct[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select('id, upc, details, image_url, billed_by_weight, location, location_seq, location_manual, manual_fields, price, quantity_step, quantity_label, quantity_size_ratio, freshop_id, popularity')
      .eq('store_only', false)
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ours.push(...((data || []) as SyncableProduct[]));
    if (!data || data.length < 1000) break;
  }

  // Every UPC key we already carry (or insert this run) — prevents duplicate
  // imports when the same UPC appears on multiple Freshop rows.
  const knownUpcKeys = new Set<string>();
  for (const p of ours) for (const k of ourKeys(p.upc || '')) knownUpcKeys.add(k);

  // Identity of everything already imported — BOTH the Freshop id and the UPC.
  // The freshop_id set is what stops no-barcode produce duplicating each run;
  // the name+size fallback covers the rare item with neither.
  const knownFreshopIds = new Set<string>();
  for (let from = 0; ; from += 5000) {
    const { data, error } = await supabase
      .from('products')
      .select('upc, freshop_id, description, pkg_size, price')
      .eq('store_only', true)
      .range(from, from + 4999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rowsIn = (data || []) as Array<{ upc: string | null; freshop_id: string | null; description: string | null; pkg_size: string | null; price: number | null }>;
    for (const r of rowsIn) {
      for (const k of ourKeys(r.upc || '')) knownUpcKeys.add(k);
      if (r.freshop_id) knownFreshopIds.add(String(r.freshop_id));
      knownFreshopIds.add(`${productMatchKey(String(r.description || ''), String(r.pkg_size || ''))}|${r.price}`);
    }
    if (!data || data.length < 5000) break;
  }

  // ── Fetch a chunk of pages, walking department by department ──
  const stats = state.stats || emptyStats();
  let pagesFetched = 0;
  let rateLimited = false;

  // Flat work queue: every not-yet-done (department, page) pair in order.
  const queue: Array<{ dept: DeptProgress; pageIdx: number }> = [];
  for (const dept of state.depts) {
    const done = new Set(dept.done);
    for (let i = 0; i < dept.pages; i++) if (!done.has(i)) queue.push({ dept, pageIdx: i });
  }

  // Walk the queue in CONCURRENT BATCHES. Each batch's pages are fetched in
  // parallel, then processed together — one bulk RPC and one bulk insert for
  // the whole batch instead of per page.
  for (let qi = 0; qi < queue.length; qi += BATCH_SIZE) {
    if (pagesFetched >= PAGES_PER_RUN || Date.now() - started > TIME_BUDGET_MS) break;

    const batch = queue.slice(qi, qi + BATCH_SIZE);
    const results = await fetchFreshopPages(
      batch.map(b => ({ departmentId: b.dept.id, skip: b.pageIdx * FRESHOP_PAGE_SIZE })),
    );

    const batchUpdates: Array<{ id: string; fields: Record<string, unknown> }> = [];
    const batchInserts: Record<string, unknown>[] = [];
    const completedPages: Array<{ dept: DeptProgress; pageIdx: number }> = [];
    const seenThisBatch = new Set<string>();

    for (let bi = 0; bi < batch.length; bi++) {
      const items = results[bi];
      if (!items) { rateLimited = true; continue; }  // back off — next invocation retries
      const { dept, pageIdx } = batch[bi];

      // ── GROW THE DEPARTMENT ── never trust Freshop's `total`.
      //
      // NCR answers datacenter IPs differently. Sized from Vercel, Bakery came
      // back as 72 items and Pantry as 23; the very same URL from elsewhere
      // reports 1,820 and 500. The sweep therefore computed one page per
      // department, imported a sliver of the store, and reported itself
      // complete — silently, because a short `total` looks exactly like a small
      // department.
      //
      // So `total` is now only a STARTING GUESS. The authoritative signal is the
      // data itself: a FULL page means there is probably another page behind it,
      // so extend this department by one and keep walking. Enumeration stops
      // only when a page comes back short — which is the real end of the list,
      // whatever Freshop claims the count is.
      // MAX_DEPT_PAGES is a runaway guard, not a real limit — 500 pages is
      // 50,000 items in one department, far beyond anything Sinclair's stocks.
      if (items.length >= FRESHOP_PAGE_SIZE
          && pageIdx + 1 >= dept.pages
          && dept.pages < MAX_DEPT_PAGES) {
        dept.pages = pageIdx + 2;
        dept.total = Math.max(dept.total, dept.pages * FRESHOP_PAGE_SIZE);
      }

      // Index THIS page by Freshop keys, then walk our barge catalog (same
      // matching semantics as the manual enrich, just page by page).
      const index = new Map<string, FreshopProduct>();
      for (const item of items) {
        for (const key of freshopKeys(item)) if (!index.has(key)) index.set(key, item);
      }

      // ── ROLL CALL ── every id Sinclair's just showed us is still listed.
      // Recorded for EVERY item on the page, including ones we go on to skip as
      // duplicates: "we already carry it" and "Sinclair's dropped it" are
      // completely different facts, and conflating them would hide live products.
      // One small bulk insert per batch beats touching ~20k product rows nightly.
      for (const item of items) if (item.id != null) seenThisBatch.add(String(item.id));
      const usedFreshopIds = new Set<string>();
      for (const product of ours) {
        if (!product.upc) continue;
        let hit: FreshopProduct | undefined;
        for (const key of ourKeys(product.upc)) { hit = index.get(key); if (hit) break; }
        if (!hit) continue;
        if (hit.id != null) usedFreshopIds.add(String(hit.id));
        stats.matched++;
        const fields = computeFields(product, hit, stats);
        if (fields) {
          batchUpdates.push({ id: product.id, fields });
          Object.assign(product, fields);  // keep in-memory copy current for later pages
        }
      }

      // ── FULL-STORE IMPORT: page items that matched nothing in our catalog
      // become new store_only products. Category comes from the DEPARTMENT this
      // page was fetched from (authoritative — AWG items have flat URLs).
      for (const item of items) {
        if (item.id != null && usedFreshopIds.has(String(item.id))) continue;

        // DEDUPE BY FRESHOP ID FIRST. UPC alone isn't enough: produce sold by
        // weight (Calhoun heirloom tomatoes, bulk items) often has no barcode,
        // so a UPC-only check silently skipped them and re-inserted the same
        // product on EVERY sync — one row per run. Every Freshop item has an
        // id, so that's the reliable identity.
        const fid = item.id != null ? String(item.id) : '';
        if (fid && knownFreshopIds.has(fid)) continue;

        const upcKey = norm(item.upc || item.barcode_upc_a);
        if (upcKey && knownUpcKeys.has(upcKey)) continue;    // already carried / inserted

        const row = buildStoreProduct(item, dept.category);
        if (!row) continue;                                   // alcohol stray / no price / no name

        // NEAR-duplicate guard — the id check above can't catch these because
        // they're separate Freshop entries. Price is part of the key on
        // purpose: same name at a different price may be a different product,
        // and showing a wrong price is worse than showing a duplicate.
        const matchKey = `${productMatchKey(String(row.description || ''), String(row.pkg_size || ''))}|${row.price}`;
        if (knownFreshopIds.has(matchKey)) continue;

        batchInserts.push(row);
        knownFreshopIds.add(matchKey);
        if (fid) knownFreshopIds.add(fid);
        if (upcKey) {
          knownUpcKeys.add(upcKey);
          if (upcKey.length >= 5) knownUpcKeys.add(upcKey.slice(0, -1));
        }
      }

      completedPages.push({ dept, pageIdx });
      pagesFetched++;
    }

    if (batchUpdates.length) {
      const { error: rpcErr } = await supabase.rpc('apply_enrich_updates', { items: batchUpdates });
      if (rpcErr) {
        state.lastError = `apply_enrich_updates: ${rpcErr.message}`;
        await saveState(supabase, state);
        return NextResponse.json({ error: state.lastError }, { status: 500 });
      }
      state.applied = (state.applied || 0) + batchUpdates.length;
    }
    if (batchInserts.length) {
      const { error: insErr } = await supabase.from('products').insert(batchInserts);
      if (insErr) {
        // 23505 = unique violation: the DB's duplicate guard caught something
        // the in-memory dedupe missed. That's the guard doing its job, NOT a
        // sync failure — retry the batch row by row so the good rows still land.
        if (insErr.code === '23505') {
          for (const row of batchInserts) {
            const { error: rowErr } = await supabase.from('products').insert(row);
            if (!rowErr) state.inserted = (state.inserted || 0) + 1;
          }
        } else {
          state.lastError = `store import insert: ${insErr.message}`;
          await saveState(supabase, state);
          return NextResponse.json({ error: state.lastError }, { status: 500 });
        }
      } else {
        state.inserted = (state.inserted || 0) + batchInserts.length;
      }
    }

    // Roll call for this batch. Written BEFORE the page checkpoint below, so a
    // page can never be marked done while its ids are missing from the roster —
    // that combination would make live products look delisted at reconcile time.
    if (seenThisBatch.size) {
      const day = state.day || today;
      const rows = Array.from(seenThisBatch, id => ({ freshop_id: id, seen_day: day }));
      for (let i = 0; i < rows.length; i += 500) {
        // Duplicates across pages are expected and harmless — ignore conflicts.
        await supabase.from('catalog_sync_seen')
          .upsert(rows.slice(i, i + 500), { onConflict: 'freshop_id,seen_day', ignoreDuplicates: true });
      }
    }

    // Only checkpoint pages whose data actually landed in the database.
    for (const { dept, pageIdx } of completedPages) dept.done.push(pageIdx);

    // Checkpoint after every batch — the admin page polls this, so progress
    // moves visibly instead of jumping once at the end of the invocation.
    state.stats = stats;
    await saveState(supabase, state);

    if (rateLimited) break;
    if (pagesFetched < PAGES_PER_RUN) await sleep(BATCH_DELAY_MS);
  }

  state.stats = stats;
  state.lastError = rateLimited ? 'Freshop rate limit mid-run — resuming next invocation' : undefined;

  // ── PHOTO/NAME BACKFILL (paced, defensive) ── run a batch when there's
  // spare budget; the self-chain below keeps it going until the backlog clears.
  let backfillHasMore = false;
  if (!rateLimited && Date.now() - started < TIME_BUDGET_MS - 8000) {
    try {
      const r = await runPhotoBackfill(supabase, started + TIME_BUDGET_MS - 2000);
      backfillHasMore = r.hasMore;
    } catch { /* never let backfill break the sync */ }
  }

  // ── Finished every department? Re-apply the order-form layout + log once ──
  const finished = state.depts.every(d => d.done.length >= d.pages);
  if (finished) {
    // ── RECONCILE ── only now, with every department walked, is "absent from
    // the roster" trustworthy. Store items Sinclair's no longer lists go
    // is_available = false, which the customer catalog already filters on, so
    // they leave the site with no new gating code. Items that came back are
    // restored. BARGE ITEMS ARE NEVER TOUCHED — they're Jen's curated list, not
    // Sinclair's, and they aren't synced. The RPC's own safety cap aborts the
    // whole thing if an implausible share would disappear.
    try {
      const { data: rec } = await supabase.rpc('reconcile_store_availability', {
        p_day: state.day || today, p_max_pct: 15,
      });
      state.reconcile = (rec ?? undefined) as SyncState['reconcile'];
    } catch { /* never let reconcile break the sweep */ }

    try {
      const layout = await applyFormLayout(supabase);
      state.completedAt = new Date().toISOString();
      await supabase.from('activity_logs').insert({
        order_id: null,
        order_number: null,
        action: 'catalog_enriched',
        from_value: "Sinclair's website",
        to_value: `${state.applied || 0} products updated — ${stats.prices} prices, ${stats.locations} locations, ${stats.images} images, ${stats.weightFlags} weight flags · ${state.inserted || 0} new store items imported · order-form layout re-applied (${layout.matched} matched / ${layout.unmatched_count} unmatched)`,
        admin_username: 'system',
        admin_display_name: 'Nightly Auto-Sync',
        admin_role: 'owner',
        note: 'Automatic nightly catalog sync',
      });
    } catch (e) {
      state.lastError = `form layout: ${e instanceof Error ? e.message : 'failed'}`;
    }
  }

  await saveState(supabase, state);

  // ── SELF-DRIVING: when there's more work and Freshop isn't pushing back,
  // schedule the next chunk immediately (fires after this response returns).
  // One kickoff — cron, GitHub Action, or the dashboard's "Sync now" — now
  // cascades through the whole sweep instead of idling between pokes.
  // Rate-limited or errored runs DON'T chain; the scheduled pokes resume them.
  // Keep chaining while EITHER the sweep or the photo backfill has work left.
  const selfUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_APP_URL;
  const moreWork = (!finished || backfillHasMore) && !rateLimited;
  if (moreWork) chainSelf(secret, selfUrl);

  return NextResponse.json({
    status: finished ? 'done' : rateLimited ? 'rate-limited' : 'in-progress',
    reconcile: state.reconcile,
    /** Client-driven chaining: the admin page fires the next chunk when this
     * is true. chainSelf() is the unattended backstop. */
    has_more: moreWork,
    session_started: state.day,
    pages_done: state.depts.reduce((s, d) => s + d.done.length, 0),
    pages_total: state.depts.reduce((s, d) => s + d.pages, 0),
    departments: state.depts.map(d => `${d.name}: ${d.done.length}/${d.pages}`),
    applied_so_far: state.applied || 0,
    store_items_imported: state.inserted || 0,
    stats,
  });
}

async function saveState(supabase: ReturnType<typeof createServiceClient>, state: SyncState) {
  await supabase.from('catalog_sync_state')
    .update({ state, updated_at: new Date().toISOString() })
    .eq('id', 1);
}

/**
 * Photo/name backfill: name-match a batch of barge items the barcode pass
 * can't reach, queue every match into the Photo Review tab (never auto-apply —
 * a high score can still be the wrong flavor). Returns whether MORE items
 * remain, so the caller can self-chain and clear the whole backlog in one
 * night rather than piggybacking only on the catalog sweep's few runs.
 */
async function runPhotoBackfill(
  supabase: ReturnType<typeof createServiceClient>,
  deadline: number,
): Promise<{ processed: number; hasMore: boolean }> {
  const staleBefore = new Date(Date.now() - 14 * 864e5).toISOString();
  // BARGE ORDER FORM ONLY, and EVERY imageless one — including items that DID
  // match a UPC but whose Sinclair's listing simply has no photo (a similar
  // product's photo still beats a blank card). Full-store items are excluded
  // on purpose: they arrive with their own photos and are the lowest priority.
  const { data } = await supabase
    .from('products')
    .select('id, description, category, pkg_size, price')
    .eq('store_only', false).eq('is_active', true)
    .is('image_url', null)
    .is('proposed_image_url', null)   // don't re-propose what's already queued
    .or(`photo_match_tried_at.is.null,photo_match_tried_at.lt.${staleBefore}`)
    .limit(13); // one extra row tells us the backlog isn't empty yet
  const rows = (data || []) as Array<{ id: string; description: string; category: string; pkg_size: string | null; price: number }>;
  let processed = 0;
  for (const p of rows.slice(0, 12)) {
    if (Date.now() > deadline) break;
    try {
      const { candidate } = await findMatchFor(p.description, p.category, p.pkg_size, Number(p.price));
      const upd: Record<string, unknown> = { photo_match_tried_at: new Date().toISOString() };
      // PHOTOS ONLY. Barge items are Jen's curated order form — we are not
      // verifying them against Sinclair's and not syncing them. This pass exists
      // purely to find each one a picture; once it has an image_url the query
      // above stops selecting it, so the work is one-and-done by construction.
      if (candidate && candidate.image_url) {
        upd.proposed_image_url = candidate.image_url;
        upd.proposed_details = candidate.proper_name;
        upd.proposed_name = candidate.freshop_name;
        upd.proposed_score = candidate.score;
        // A borrowed photo came from a DIFFERENT listing in the same
        // department, so the reviewer must see that before approving.
        upd.proposed_image_borrowed = candidate.borrowed_photo;
      }
      await supabase.from('products').update(upd).eq('id', p.id);
      processed++;
    } catch { /* skip this item, keep going */ }
  }
  return { processed, hasMore: rows.length > processed };
}

/** Fire another invocation of this route (self-driving chain). */
function chainSelf(secret: string | undefined, selfUrl: string | undefined) {
  if (!secret || !selfUrl) return;
  after(async () => {
    try {
      await fetch(`${selfUrl}/api/cron/catalog-sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(3000),
      });
    } catch { /* the scheduled pokes are the backstop */ }
  });
}

// Vercel cron uses GET; the GitHub Action and manual tests may use either.
export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
