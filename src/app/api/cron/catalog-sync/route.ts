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
import {
  fetchFreshopPage, fetchFreshopTotal, freshopKeys, ourKeys, computeFields,
  buildStoreProduct, norm,
  FRESHOP_PAGE_SIZE, FRESHOP_DEPARTMENTS,
  type FreshopProduct, type SyncableProduct, type SyncStats,
} from '@/lib/freshop-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGES_PER_RUN = 12;           // small chunks keep us under NCR's rate limits (~208 storefront pages total)
const PAGE_DELAY_MS = 1200;         // gentle pacing, same spirit as the manual enrich
const TIME_BUDGET_MS = 40_000;      // leave headroom under maxDuration

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
    const depts: DeptProgress[] = [];
    for (const d of FRESHOP_DEPARTMENTS) {
      const total = await fetchFreshopTotal(d.id);
      if (total == null) {
        state.lastError = `Freshop unreachable sizing ${d.name} — will retry on next invocation`;
        await saveState(supabase, state);
        return NextResponse.json({ status: 'waiting', reason: state.lastError }, { status: 200 });
      }
      depts.push({ id: d.id, name: d.name, category: d.category, total, pages: Math.ceil(total / FRESHOP_PAGE_SIZE), done: [] });
      await sleep(400);
    }
    state.depts = depts;
  }

  // ── Load our catalog once per invocation (id + syncable fields) ──
  const ours: SyncableProduct[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select('id, upc, details, image_url, billed_by_weight, location, location_seq, location_manual, price, quantity_step, quantity_label, quantity_size_ratio, freshop_id')
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ours.push(...((data || []) as SyncableProduct[]));
    if (!data || data.length < 1000) break;
  }

  // Every UPC key we already carry (or insert this run) — prevents duplicate
  // imports when the same UPC appears on multiple Freshop rows.
  const knownUpcKeys = new Set<string>();
  for (const p of ours) for (const k of ourKeys(p.upc || '')) knownUpcKeys.add(k);

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

  for (const { dept, pageIdx } of queue) {
    if (pagesFetched >= PAGES_PER_RUN || Date.now() - started > TIME_BUDGET_MS) break;
    const items = await fetchFreshopPage(dept.id, pageIdx * FRESHOP_PAGE_SIZE);
    if (!items) { rateLimited = true; break; }  // back off — next invocation retries

    // Index THIS page by Freshop keys, then walk our catalog (same matching
    // semantics as the manual enrich, just page by page).
    const index = new Map<string, FreshopProduct>();
    for (const item of items) {
      for (const key of freshopKeys(item)) if (!index.has(key)) index.set(key, item);
    }
    const usedFreshopIds = new Set<string>();
    const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
    for (const product of ours) {
      if (!product.upc) continue;
      let hit: FreshopProduct | undefined;
      for (const key of ourKeys(product.upc)) { hit = index.get(key); if (hit) break; }
      if (!hit) continue;
      if (hit.id != null) usedFreshopIds.add(String(hit.id));
      stats.matched++;
      const fields = computeFields(product, hit, stats);
      if (fields) {
        updates.push({ id: product.id, fields });
        Object.assign(product, fields);  // keep in-memory copy current for later pages
      }
    }

    if (updates.length) {
      const { error: rpcErr } = await supabase.rpc('apply_enrich_updates', { items: updates });
      if (rpcErr) {
        state.lastError = `apply_enrich_updates: ${rpcErr.message}`;
        await saveState(supabase, state);
        return NextResponse.json({ error: state.lastError }, { status: 500 });
      }
      state.applied = (state.applied || 0) + updates.length;
    }

    // ── FULL-STORE IMPORT: page items that matched nothing in our catalog
    // become new store_only products. Category comes from the DEPARTMENT this
    // page was fetched from (authoritative — AWG items have flat URLs).
    const inserts: Record<string, unknown>[] = [];
    for (const item of items) {
      if (item.id != null && usedFreshopIds.has(String(item.id))) continue;
      const upcKey = norm(item.upc || item.barcode_upc_a);
      if (upcKey && knownUpcKeys.has(upcKey)) continue;      // already carried / inserted
      const row = buildStoreProduct(item, dept.category);
      if (!row) continue;                                     // alcohol stray / no price / no name
      inserts.push(row);
      if (upcKey) {
        knownUpcKeys.add(upcKey);
        if (upcKey.length >= 5) knownUpcKeys.add(upcKey.slice(0, -1));
      }
    }
    if (inserts.length) {
      const { error: insErr } = await supabase.from('products').insert(inserts);
      if (insErr) {
        state.lastError = `store import insert: ${insErr.message}`;
        await saveState(supabase, state);
        return NextResponse.json({ error: state.lastError }, { status: 500 });
      }
      state.inserted = (state.inserted || 0) + inserts.length;
    }

    dept.done.push(pageIdx);
    pagesFetched++;
    if (pagesFetched < PAGES_PER_RUN) await sleep(PAGE_DELAY_MS);
  }

  state.stats = stats;
  state.lastError = rateLimited ? 'Freshop rate limit mid-run — resuming next invocation' : undefined;

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
