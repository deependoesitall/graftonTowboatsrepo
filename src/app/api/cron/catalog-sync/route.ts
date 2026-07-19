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
import { createServiceClient } from '@/lib/supabase/server';
import { getAdminSession } from '@/lib/admin-auth-server';
import { applyFormLayout } from '@/lib/form-layout-apply';
import {
  fetchFreshopPage, fetchFreshopTotal, freshopKeys, ourKeys, computeFields,
  FRESHOP_PAGE_SIZE, type FreshopProduct, type SyncableProduct, type SyncStats,
} from '@/lib/freshop-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGES_PER_RUN = 8;            // small chunks keep us under NCR's rate limits
const PAGE_DELAY_MS = 1500;         // same pacing as the manual enrich
const TIME_BUDGET_MS = 40_000;      // leave headroom under maxDuration

interface SyncState {
  day?: string;                     // sync session date (America/Chicago)
  total?: number;
  pages?: number;
  donePages?: number[];
  stats?: SyncStats;
  applied?: number;
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

  // New night → fresh session. Same night + already completed → no-op.
  if (state.day !== today) {
    state = { day: today, donePages: [], stats: emptyStats(), applied: 0 };
  } else if (state.completedAt) {
    return NextResponse.json({ status: 'done', day: today, completedAt: state.completedAt, stats: state.stats });
  }

  // ── Discover catalog size once per session ──
  if (!state.total || !state.pages) {
    const total = await fetchFreshopTotal();
    if (!total) {
      state.lastError = 'Freshop unreachable (rate limit?) — will retry on next invocation';
      await saveState(supabase, state);
      return NextResponse.json({ status: 'waiting', reason: state.lastError }, { status: 200 });
    }
    state.total = total;
    state.pages = Math.ceil(total / FRESHOP_PAGE_SIZE);
  }

  // ── Load our catalog once per invocation (id + syncable fields) ──
  const ours: SyncableProduct[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select('id, upc, details, image_url, billed_by_weight, location, location_seq, price, quantity_step, quantity_label, quantity_size_ratio, freshop_id')
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ours.push(...((data || []) as SyncableProduct[]));
    if (!data || data.length < 1000) break;
  }

  // ── Fetch a chunk of pages ──
  const doneSet = new Set(state.donePages || []);
  const queue = Array.from({ length: state.pages }, (_, i) => i).filter(i => !doneSet.has(i));
  const stats = state.stats || emptyStats();
  let pagesFetched = 0;
  let rateLimited = false;

  for (const pageIdx of queue) {
    if (pagesFetched >= PAGES_PER_RUN || Date.now() - started > TIME_BUDGET_MS) break;
    const items = await fetchFreshopPage(pageIdx * FRESHOP_PAGE_SIZE);
    if (!items) { rateLimited = true; break; }  // back off — next invocation retries

    // Index THIS page by Freshop keys, then walk our catalog (same matching
    // semantics as the manual enrich, just page by page).
    const index = new Map<string, FreshopProduct>();
    for (const item of items) {
      for (const key of freshopKeys(item)) if (!index.has(key)) index.set(key, item);
    }
    const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
    for (const product of ours) {
      if (!product.upc) continue;
      let hit: FreshopProduct | undefined;
      for (const key of ourKeys(product.upc)) { hit = index.get(key); if (hit) break; }
      if (!hit) continue;
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

    doneSet.add(pageIdx);
    pagesFetched++;
    if (pagesFetched < PAGES_PER_RUN) await sleep(PAGE_DELAY_MS);
  }

  state.donePages = Array.from(doneSet);
  state.stats = stats;
  state.lastError = rateLimited ? 'Freshop rate limit mid-run — resuming next invocation' : undefined;

  // ── Finished the whole catalog? Re-apply the order-form layout + log once ──
  const finished = state.donePages.length >= (state.pages || 0);
  if (finished) {
    try {
      const layout = await applyFormLayout(supabase);
      state.completedAt = new Date().toISOString();
      await supabase.from('activity_logs').insert({
        order_id: null,
        order_number: null,
        action: 'catalog_enriched',
        from_value: "Sinclair's website",
        to_value: `${state.applied || 0} products updated — ${stats.prices} prices, ${stats.locations} locations, ${stats.images} images, ${stats.weightFlags} weight flags · order-form layout re-applied (${layout.matched} matched / ${layout.unmatched_count} unmatched)`,
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

  return NextResponse.json({
    status: finished ? 'done' : rateLimited ? 'rate-limited' : 'in-progress',
    day: today,
    pages_done: state.donePages.length,
    pages_total: state.pages,
    applied_so_far: state.applied || 0,
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
