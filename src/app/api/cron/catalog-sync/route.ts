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
}

const emptyStats = (): SyncStats =>
  ({ matched: 0, images: 0, details: 0, weightFlags: 0, locations: 0, prices: 0 });

function chicagoDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
      return NextResponse.json({ status: 'done', day: today, completedAt: state.completedAt, stats: state.stats, inserted: state.inserted || 0 });
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
    // Size all 9 departments in parallel — one round-trip instead of nine.
    const totals = await Promise.all(FRESHOP_DEPARTMENTS.map(d => fetchFreshopTotal(d.id)));
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

  // Store-only UPCs — thin projection, just for dedupe.
  for (let from = 0; ; from += 5000) {
    const { data, error } = await supabase
      .from('products')
      .select('upc')
      .eq('store_only', true)
      .not('upc', 'is', null)
      .range(from, from + 4999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of (data || []) as Array<{ upc: string | null }>) {
      for (const k of ourKeys(r.upc || '')) knownUpcKeys.add(k);
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

    for (let bi = 0; bi < batch.length; bi++) {
      const items = results[bi];
      if (!items) { rateLimited = true; continue; }  // back off — next invocation retries
      const { dept, pageIdx } = batch[bi];

      // Index THIS page by Freshop keys, then walk our barge catalog (same
      // matching semantics as the manual enrich, just page by page).
      const index = new Map<string, FreshopProduct>();
      for (const item of items) {
        for (const key of freshopKeys(item)) if (!index.has(key)) index.set(key, item);
      }
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
        const upcKey = norm(item.upc || item.barcode_upc_a);
        if (upcKey && knownUpcKeys.has(upcKey)) continue;    // already carried / inserted
        const row = buildStoreProduct(item, dept.category);
        if (!row) continue;                                   // alcohol stray / no price / no name
        batchInserts.push(row);
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
        state.lastError = `store import insert: ${insErr.message}`;
        await saveState(supabase, state);
        return NextResponse.json({ error: state.lastError }, { status: 500 });
      }
      state.inserted = (state.inserted || 0) + batchInserts.length;
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

  // ── AUTO PHOTO/NAME BACKFILL (paced, defensive) ──
  // A few barge items per invocation that the barcode pass can't reach get
  // name-matched to Sinclair's; HIGH-confidence matches (name + price/size
  // corroborated) are auto-applied so obvious items clean themselves up.
  // Wrapped so it can NEVER break the core sync; skipped when NCR is already
  // pushing back this run.
  if (!rateLimited && Date.now() - started < TIME_BUDGET_MS - 8000) {
    try {
      const staleBefore = new Date(Date.now() - 14 * 864e5).toISOString();
      const { data: needy } = await supabase
        .from('products')
        .select('id, description, category, pkg_size, price, manual_fields')
        .eq('store_only', false).eq('is_active', true)
        .is('image_url', null).is('freshop_id', null)
        .or(`photo_match_tried_at.is.null,photo_match_tried_at.lt.${staleBefore}`)
        .limit(6);
      for (const p of (needy || []) as Array<{ id: string; description: string; category: string; pkg_size: string | null; price: number; manual_fields: string[] | null }>) {
        if (Date.now() - started > TIME_BUDGET_MS - 2000) break;
        const { candidate } = await findMatchFor(p.description, p.category, p.pkg_size, Number(p.price));
        const upd: Record<string, unknown> = { photo_match_tried_at: new Date().toISOString() };
        if (candidate && candidate.rename) {
          // STRONG (name + price/size corroborated) → auto-apply, clear any proposal.
          const locked = new Set(p.manual_fields || []);
          if (!locked.has('image_url')) upd.image_url = candidate.image_url;
          if (!locked.has('details')) upd.details = candidate.proper_name;
          upd.image_source = 'name_match';
          upd.proposed_image_url = null; upd.proposed_details = null;
          upd.proposed_name = null; upd.proposed_score = null;
        } else if (candidate) {
          // WEAKER → park as a proposal for the Photo Review tab.
          upd.proposed_image_url = candidate.image_url;
          upd.proposed_details = candidate.proper_name;
          upd.proposed_name = candidate.freshop_name;
          upd.proposed_score = candidate.score;
        }
        await supabase.from('products').update(upd).eq('id', p.id);
      }
    } catch { /* never let backfill break the sync */ }
  }

  // ── Finished every department? Re-apply the order-form layout + log once ──
  const finished = state.depts.every(d => d.done.length >= d.pages);
  if (finished) {
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
  const selfUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_APP_URL;
  if (!finished && !rateLimited && secret && selfUrl) {
    after(async () => {
      try {
        // Deliver the request, then abort our wait — the next invocation is
        // its own function and finishes on its own; we must not sit through
        // its 40s inside OUR time budget.
        await fetch(`${selfUrl}/api/cron/catalog-sync`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(3000),
        });
      } catch { /* abort/timeout expected — scheduled invocations are the backstop */ }
    });
  }

  return NextResponse.json({
    status: finished ? 'done' : rateLimited ? 'rate-limited' : 'in-progress',
    /** Client-driven chaining: the admin page fires the next chunk when this
     * is true. after() below is the unattended backstop — belt and braces,
     * because serverless after() callbacks aren't guaranteed to survive. */
    has_more: !finished && !rateLimited,
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

// Vercel cron uses GET; the GitHub Action and manual tests may use either.
export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
