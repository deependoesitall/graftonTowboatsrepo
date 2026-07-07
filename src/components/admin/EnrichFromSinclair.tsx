'use client';
// src/components/admin/EnrichFromSinclair.tsx
// Catalog enrichment, computed in the ADMIN'S BROWSER:
//   1. Downloads Sinclair's ~12,400-product catalog page by page (with a
//      live progress bar) — browser requests don't hit Vercel's function
//      timeout or NCR's datacenter rate limits, unlike the old server run.
//   2. Matches YOUR products by UPC (exact, normalized — no fuzzy matching).
//   3. Sends only the computed field updates to the server for validation
//      and saving (details, image_url, billed_by_weight — nothing else).
import { useState, useRef } from 'react';
import { Sparkles, Loader2, X, CheckCircle2, AlertCircle, ImagePlus, FileText, Scale } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';

const APP_KEY = 'sinclair';
const STORE_ID = '4297';
const PAGE_SIZE = 100;
const IMAGE_BASE = 'https://images.freshop.ncrcloud.com';
// NCR Freshop returns error_code 429 (as HTTP 400) after ~50 req/min.
// Verified live: 3 parallel pages + 600ms gaps still trips the limit around
// page 8; one request every ~1.3s completes all ~124 pages reliably.
const REQUEST_DELAY_MS = 1300;
const COOLDOWN_SECS = 90;
const MAX_COOLDOWNS = 15;
const CHECKPOINT_KEY = 'freshop_enrich_checkpoint_v1';
const CHECKPOINT_EVERY = 10;

interface FreshopProduct {
  upc?: string;
  barcode_upc_a?: string;
  barcode_ean13?: string;
  name?: string;
  size?: string;
  cover_image?: string;
  is_weight_required?: boolean;
}
interface OurProduct {
  id: string;
  upc: string | null;
  details: string | null;
  image_url: string | null;
  billed_by_weight: boolean;
}
interface Summary {
  ours: number; noUpc: number; matched: number;
  images: number; details: number; weightFlags: number;
  indexed: number; unmatchedSample: string[];
}

// ─── UPC normalization (mirrors what we verified against live data) ───
function norm(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim().replace(/\.0+$/, '');
  return s.replace(/\D/g, '').replace(/^0+/, '');
}
function freshopKeys(p: FreshopProduct): string[] {
  const keys = new Set<string>();
  for (const raw of [p.upc, p.barcode_upc_a, p.barcode_ean13]) {
    const n = norm(raw);
    if (n.length >= 4) keys.add(n);
  }
  const upcA = norm(p.barcode_upc_a);
  if (upcA.length >= 5) keys.add(upcA.slice(0, -1));
  return Array.from(keys);
}
function ourKeys(upc: string): string[] {
  const n = norm(upc);
  if (n.length < 4) return [];
  const keys = [n];
  if (n.length >= 5) keys.push(n.slice(0, -1));
  return keys;
}
function detailsFrom(p: FreshopProduct): string | null {
  const name = (p.name || '').trim();
  if (!name) return null;
  const size = (p.size || '').trim();
  if (size && !name.toLowerCase().includes(size.toLowerCase())) return `${name} (${size})`;
  return name;
}
function imageFrom(p: FreshopProduct): string | null {
  return p.cover_image ? `${IMAGE_BASE}/${p.cover_image}_large.png` : null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface EnrichCheckpoint {
  version: 1;
  total: number;
  pages: number;
  donePages: number[];
  products: FreshopProduct[];
  savedAt: number;
}

function loadCheckpoint(): EnrichCheckpoint | null {
  try {
    const raw = sessionStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    const cp = JSON.parse(raw) as EnrichCheckpoint;
    if (cp.version !== 1 || !Array.isArray(cp.donePages) || !Array.isArray(cp.products)) return null;
    // Expire after 2 hours — the catalog won't change that fast.
    if (Date.now() - cp.savedAt > 2 * 60 * 60 * 1000) {
      sessionStorage.removeItem(CHECKPOINT_KEY);
      return null;
    }
    return cp;
  } catch {
    return null;
  }
}

function saveCheckpoint(cp: EnrichCheckpoint) {
  try {
    sessionStorage.setItem(CHECKPOINT_KEY, JSON.stringify(cp));
  } catch { /* quota exceeded — non-fatal */ }
}

function clearCheckpoint() {
  sessionStorage.removeItem(CHECKPOINT_KEY);
}

function indexFromProducts(products: FreshopProduct[]): Map<string, FreshopProduct> {
  const index = new Map<string, FreshopProduct>();
  for (const item of products) {
    for (const key of freshopKeys(item)) {
      if (!index.has(key)) index.set(key, item);
    }
  }
  return index;
}

// One attempt per page (plus one quick retry for network blips). Quota
// handling happens in the outer loop with a cooldown — never hammer retries.
async function fetchFreshopPage(skip: number): Promise<FreshopProduct[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `https://api.freshop.ncrcloud.com/1/products?app_key=${APP_KEY}&store_id=${STORE_ID}&limit=${PAGE_SIZE}&skip=${skip}&sort=name&name_sort=asc`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.items)) return data.items as FreshopProduct[];
      }
      return null; // 400 w/ error_code 429 → quota hit; outer loop cools down
    } catch { await sleep(400); }
  }
  return null;
}

export function EnrichFromSinclair({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'ready' | 'applying' | 'done'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState('');
  const updatesRef = useRef<{ id: string; fields: Record<string, unknown> }[]>([]);
  const cancelRef = useRef(false);

  async function readError(res: Response): Promise<string> {
    const text = await res.text();
    try { return JSON.parse(text).error || text.slice(0, 200); }
    catch { return text.slice(0, 200) || `HTTP ${res.status}`; }
  }

  // ── Phase 1+2: download Sinclair catalog in the browser, match locally ──
  async function scan() {
    setOpen(true); setPhase('scanning'); setError(''); setSummary(null);
    cancelRef.current = false;
    try {
      // Our catalog first (admin API, paginated)
      setProgress({ done: 0, total: 1, label: 'Loading your catalog…' });
      const ours: OurProduct[] = [];
      for (let page = 1; ; page++) {
        const res = await adminFetch(`/api/products?per_page=500&page=${page}`);
        if (!res.ok) throw new Error(await readError(res));
        const { products, total } = await res.json();
        ours.push(...(products || []).map((p: any) => ({
          id: p.id, upc: p.upc, details: p.details, image_url: p.image_url,
          billed_by_weight: !!p.billed_by_weight,
        })));
        if (!products?.length || ours.length >= (total || 0)) break;
      }

      // Sinclair's catalog, page by page with live progress
      const head = await fetch(`https://api.freshop.ncrcloud.com/1/products?app_key=${APP_KEY}&store_id=${STORE_ID}&limit=1`).then(r => r.json());
      const total: number = head?.total ?? 0;
      if (!total) throw new Error("Couldn't reach Sinclair's product catalog.");
      const pages = Math.ceil(total / PAGE_SIZE);

      // Resume a partial download if the last run was interrupted by rate limits.
      const saved = loadCheckpoint();
      const doneSet = new Set<number>(saved?.pages === pages ? saved.donePages : []);
      const collected: FreshopProduct[] = saved?.pages === pages ? [...saved.products] : [];
      let indexed = collected.length;
      let donePages = doneSet.size;
      let cooldowns = 0;
      const queue = Array.from({ length: pages }, (_, i) => i).filter(i => !doneSet.has(i));

      setProgress({
        done: donePages,
        total: pages,
        label: donePages > 0
          ? `Resuming Sinclair's catalog (${donePages} of ${pages} pages already downloaded)…`
          : `Downloading Sinclair's catalog…`,
      });

      while (queue.length) {
        if (cancelRef.current) return;
        const page = queue.shift()!;
        const items = await fetchFreshopPage(page * PAGE_SIZE);

        if (items === null) {
          queue.unshift(page);
          cooldowns++;
          if (cooldowns > MAX_COOLDOWNS) {
            saveCheckpoint({
              version: 1, total, pages,
              donePages: Array.from(doneSet),
              products: collected,
              savedAt: Date.now(),
            });
            throw new Error(
              `Sinclair's API kept rate-limiting after ${donePages} of ${pages} pages. ` +
              `Progress was saved — click Enrich again to resume where it left off.`
            );
          }
          for (let s = COOLDOWN_SECS; s > 0; s--) {
            if (cancelRef.current) return;
            setProgress({
              done: donePages,
              total: pages,
              label: `Sinclair's API limit reached — resuming in ${s}s…`,
            });
            await sleep(1000);
          }
          continue;
        }

        doneSet.add(page);
        donePages++;
        indexed += items.length;
        collected.push(...items);
        setProgress({ done: donePages, total: pages, label: `Downloading Sinclair's catalog…` });

        if (donePages % CHECKPOINT_EVERY === 0) {
          saveCheckpoint({
            version: 1, total, pages,
            donePages: Array.from(doneSet),
            products: collected,
            savedAt: Date.now(),
          });
        }

        await sleep(REQUEST_DELAY_MS);
      }

      clearCheckpoint();
      const index = indexFromProducts(collected);
      if (indexed < total * 0.95) {
        throw new Error(`Only ${indexed.toLocaleString()} of ${total.toLocaleString()} Sinclair products downloaded. Try again in a few minutes.`);
      }

      // Match + compute updates locally
      const updates: { id: string; fields: Record<string, unknown> }[] = [];
      let matched = 0, images = 0, details = 0, weightFlags = 0, noUpc = 0;
      const unmatchedSample: string[] = [];
      for (const product of ours) {
        if (!product.upc || !norm(product.upc)) { noUpc++; continue; }
        let hit: FreshopProduct | undefined;
        for (const key of ourKeys(product.upc)) { hit = index.get(key); if (hit) break; }
        if (!hit) {
          if (unmatchedSample.length < 8) unmatchedSample.push(String(product.upc));
          continue;
        }
        matched++;
        const fields: Record<string, unknown> = {};
        const newDetails = detailsFrom(hit);
        const newImage = imageFrom(hit);
        if (newDetails && (overwrite || !product.details) && newDetails !== product.details) { fields.details = newDetails; details++; }
        if (newImage && (overwrite || !product.image_url) && newImage !== product.image_url) { fields.image_url = newImage; images++; }
        if (hit.is_weight_required && !product.billed_by_weight) { fields.billed_by_weight = true; weightFlags++; }
        if (Object.keys(fields).length) updates.push({ id: product.id, fields });
      }

      updatesRef.current = updates;
      setSummary({ ours: ours.length, noUpc, matched, images, details, weightFlags, indexed, unmatchedSample });
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
      setPhase('idle');
    }
  }

  // ── Phase 3: save in small batches (server validates a field whitelist) ──
  async function apply() {
    const updates = updatesRef.current;
    if (!updates.length || !summary) return;
    setPhase('applying'); setError('');
    setProgress({ done: 0, total: updates.length, label: 'Saving…' });
    try {
      let applied = 0;
      for (let i = 0; i < updates.length; i += 250) {
        const chunk = updates.slice(i, i + 250);
        const isLast = i + 250 >= updates.length;
        const res = await adminFetch('/api/admin/products/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: chunk,
            ...(isLast ? { log: {
              total_applied: applied + chunk.length,
              images: summary.images, details: summary.details,
              weight_flags: summary.weightFlags, overwrite,
            } } : {}),
          }),
        });
        if (!res.ok) throw new Error(await readError(res));
        const data = await res.json();
        applied += data.applied ?? chunk.length;
        setProgress({ done: applied, total: updates.length, label: 'Saving…' });
      }
      setPhase('done');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setPhase('ready');
    }
  }

  function close() {
    cancelRef.current = true;
    setOpen(false); setPhase('idle'); setSummary(null); setError('');
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <>
      <button onClick={scan}
        className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5"
        title="Pull matching product images & descriptions from Sinclair's website">
        <Sparkles className="w-4 h-4" /> Enrich from Sinclair&apos;s
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={close}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-brand-navy flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand-gold" /> Enrich from Sinclair&apos;s
              </h2>
              <button onClick={close} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {(phase === 'scanning' || phase === 'applying') && (
              <div className="py-4">
                <p className="text-sm text-gray-600 mb-2">{progress.label}</p>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden mb-1.5">
                  <div className="bg-brand-green h-3 rounded-full transition-all duration-200" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-400">
                  {phase === 'scanning'
                    ? `${progress.done} of ${progress.total} pages · ~3 min (Sinclair's API allows ~50 requests/min) · keep this tab open`
                    : `${progress.done.toLocaleString()} of ${progress.total.toLocaleString()} products saved`}
                </p>
              </div>
            )}

            {phase === 'ready' && summary && (
              <>
                <p className="text-sm text-gray-600 mb-3">
                  Matched <strong className="text-brand-navy">{summary.matched.toLocaleString()}</strong> of
                  your {summary.ours.toLocaleString()} products by UPC
                  {summary.noUpc > 0 && <span className="text-gray-400"> ({summary.noUpc} have no UPC and were skipped)</span>},
                  checked against {summary.indexed.toLocaleString()} Sinclair products. Nothing saved yet.
                </p>
                {summary.matched < (summary.ours - summary.noUpc) * 0.5 && summary.unmatchedSample.length > 0 && (
                  <p className="text-[11px] text-gray-400 mb-3 break-all">
                    Sample unmatched UPCs: {summary.unmatchedSample.join(', ')}
                  </p>
                )}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm bg-green-50 rounded-lg px-3 py-2">
                    <ImagePlus className="w-4 h-4 text-green-600 shrink-0" />
                    <span><strong>{summary.images.toLocaleString()}</strong> product images will be pulled in</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm bg-blue-50 rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <span><strong>{summary.details.toLocaleString()}</strong> customer-friendly descriptions will be added</span>
                  </div>
                  {summary.weightFlags > 0 && (
                    <div className="flex items-center gap-2 text-sm bg-amber-50 rounded-lg px-3 py-2">
                      <Scale className="w-4 h-4 text-amber-600 shrink-0" />
                      <span><strong>{summary.weightFlags}</strong> items will be flagged as billed-by-weight</span>
                    </div>
                  )}
                </div>
                <label className="flex items-start gap-2 mb-5 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={overwrite}
                    onChange={e => { setOverwrite(e.target.checked); }} />
                  <span className="text-xs text-gray-500">
                    <strong className="text-brand-navy">Overwrite existing</strong> — also replace images and
                    descriptions you&apos;ve already set. Changing this re-runs the scan.
                  </span>
                </label>
                <div className="flex gap-2">
                  <button onClick={scan} className="btn-outline text-sm px-4 py-2.5 rounded-lg">Re-scan</button>
                  <button onClick={apply} disabled={updatesRef.current.length === 0}
                    className="btn-gold flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                    <Sparkles className="w-4 h-4" /> Apply to {updatesRef.current.length.toLocaleString()} products
                  </button>
                </div>
              </>
            )}

            {phase === 'done' && summary && (
              <div className="text-center py-4">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="font-bold text-brand-navy mb-1">Catalog enriched!</p>
                <p className="text-sm text-gray-500 mb-4">
                  {summary.images.toLocaleString()} images and {summary.details.toLocaleString()} descriptions
                  pulled in. Recorded in the activity log.
                </p>
                <button onClick={close} className="btn-primary text-sm px-6 py-2">Done</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
