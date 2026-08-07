'use client';
// src/app/admin/products/page.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Package, AlertCircle, CheckCircle2, Loader2,
         Search, Pencil, Check, X, ToggleLeft, ToggleRight,
         ChevronLeft, ChevronRight, RefreshCw, Plus, Lock,
         Download, Trash2, Layers, PackageX, PackageCheck, Filter,
         ImagePlus, Tag, Moon } from 'lucide-react';
import Image from 'next/image';
import { formatCurrency, MAIN_CATEGORIES } from '@/lib/utils';
import { Product } from '@/types';
import { useRouter } from 'next/navigation';
import { fetchAdminSession, canAccess, adminFetch } from '@/lib/admin-auth';
import { ImportWizard } from '@/components/admin/ImportWizard';
import { useConfirm } from '@/components/ui/ConfirmDialog';


// -- Thumbnail that opens the full-size image in a click-to-close lightbox,
// so a reviewer can eyeball the actual photo before approving a match.
function ZoomableThumb({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="relative w-16 h-16 bg-white border border-gray-200 rounded-lg overflow-hidden shrink-0 cursor-zoom-in hover:border-brand-steel transition-colors"
        title="Click to view full size">
        <Image src={src} alt={alt} fill className="object-contain p-1" unoptimized />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} onClick={e => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-white" />
          <button onClick={() => setOpen(false)}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 rounded-full p-2">
            <X className="w-5 h-5" />
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

// -- Quiet nightly-sync status. The catalog syncs ITSELF (12:05 AM kickoff,
// chunks overnight: prices, locations, images, new store items, order-form
// layout). Admins never run anything — this line just proves it's happening.
// Owners get a small "Sync now" escape hatch for rare mid-day price changes.
function CatalogSyncStatus({ isOwner }: { isOwner: boolean }) {
  const [status, setStatus] = useState<null | {
    completed_at: string | null; session_day: string | null; in_progress: boolean;
    pages_done: number; pages_total: number; sized_items: number;
    departments: string[]; products_updated: number; store_items_imported: number;
    last_error: string | null; checkpoint_updated_at: string | null;
  }>(null);
  const [kicking, setKicking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stale = !!status?.in_progress && !!status.checkpoint_updated_at
    && Date.now() - new Date(status.checkpoint_updated_at).getTime() > 5 * 60_000;

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/sync-status');
      if (res.ok) setStatus(await res.json());
    } catch { /* non-critical */ }
  }, []);

  // While a sync is running, poll every 4s so the page shows live progress
  // as the self-driving chunk chain cascades in the background.
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await adminFetch('/api/admin/sync-status');
        if (!res.ok) return;
        const s = await res.json();
        setStatus(s);
        if (!s.in_progress) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      } catch { /* non-critical */ }
    }, 4000);
  }, []);

  useEffect(() => {
    load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  // If we land on the page mid-sync, start polling immediately
  useEffect(() => {
    if (status?.in_progress && !stale) startPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.in_progress]);

  // CLIENT-DRIVEN CHAIN. The cron route also self-drives via after(), but
  // serverless after() callbacks aren't guaranteed to survive the function
  // freezing — which is exactly why a hand-kicked sync used to stall and fall
  // back to "Nightly sync runs at 12:05 AM". While this tab is open we keep
  // firing chunks ourselves until the route reports it's finished.
  async function syncNow() {
    setKicking(true);
    startPolling();
    try {
      for (let guard = 0; guard < 40; guard++) {
        const res = await adminFetch('/api/cron/catalog-sync', { method: 'POST' });
        if (!res.ok) break;
        const r = await res.json().catch(() => null);
        await load();
        if (!r?.has_more) break;   // done, rate-limited, or waiting on Freshop
      }
    } finally {
      setKicking(false);
      load();
    }
  }

  // COMMUNICATE, don't guard: say exactly what the sync is doing and where
  // it stands — including the store size it was told (so a wobbly Freshop
  // total during their midnight rebuild is visible, not silent). A session
  // whose checkpoint hasn't moved in a few minutes isn't "syncing" — it's
  // PAUSED and waiting for the next kickoff.
  const label = !status ? 'Checking sync…'
    : status.in_progress && stale
    ? `Sync paused at ${status.pages_done}/${status.pages_total} pages (${status.store_items_imported.toLocaleString()} items in) — resumes tonight, or Sync now`
    : status.in_progress
    ? `Syncing — ${status.pages_done}/${status.pages_total} pages · sized at ${status.sized_items.toLocaleString()} store items · ${status.store_items_imported.toLocaleString()} imported so far`
    : status.completed_at
    ? `Synced ${new Date(status.completed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${status.products_updated.toLocaleString()} updated · ${status.store_items_imported.toLocaleString()} store items imported (store sized at ${status.sized_items.toLocaleString()})`
    : 'Nightly sync runs at 12:05 AM';

  const deptDetail = status?.departments?.length
    ? `Department progress:\n${status.departments.join('\n')}`
    : 'The catalog updates itself every night — prices, aisle locations, images, new store items, and the order-form layout.';

  return (
    <div className="flex flex-col items-end mr-1">
      <div className="flex items-center gap-2 text-xs text-gray-400" title={deptDetail}>
        {kicking || (status?.in_progress && !stale)
          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-river" />
          : status?.completed_at && !status?.in_progress
          ? <CheckCircle2 className="w-3.5 h-3.5 text-brand-green" />
          : <Moon className="w-3.5 h-3.5" />}
        <span>{label}</span>
        {isOwner && (
          <button onClick={syncNow} disabled={kicking}
            className="underline underline-offset-2 hover:text-brand-navy disabled:opacity-50">
            {kicking ? 'syncing — keep this tab open…' : status?.in_progress ? 'Resume sync' : 'Sync now'}
          </button>
        )}
      </div>
      {status?.last_error && (
        <p className="text-[10px] text-amber-600 mt-0.5">{status.last_error}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHOTO BACKFILL — finds photos + proper names on Sinclair's site for items
// the nightly UPC sync can't reach (no UPC, or a UPC that doesn't line up).
// Catches the POS-abbreviation rows: "SCHUBERT DNR YST RLS" → Sister
// Schubert's Dinner Yeast Rolls, with the photo.
//
// Name matching is fuzzy and a wrong photo is customer-visible, so NOTHING is
// written until a human has looked at it — search, review side by side,
// deselect anything wrong, then apply.
// ─────────────────────────────────────────────────────────────────────────────
interface BackfillProposal {
  id: string;
  description: string;
  category: string;
  pkg_size: string | null;
  price: number;
  current_details: string | null;
  candidate: {
    proper_name: string;
    freshop_name: string;
    image_url: string;
    score: number;
    dept_path: string;
    freshop_size: string | null;
    freshop_price: number | null;
    rename: boolean;
    size_match: boolean;
    price_match: boolean;
  };
}

function PhotoBackfillPanel({ onClose, onApplied }: {
  onClose: () => void; onApplied: () => void;
}) {
  const [proposals, setProposals] = useState<BackfillProposal[]>([]);
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);
  const [totalMissing, setTotalMissing] = useState(0);
  const [scannedCount, setScannedCount] = useState(0);
  const [note, setNote] = useState('');
  // id → keep photo, and whether to also take the corrected name
  const [picks, setPicks] = useState<Record<string, { photo: boolean; name: boolean }>>({});

  const scan = useCallback(async () => {
    setScanning(true);
    setNote('');
    let cursor = 0;
    try {
      for (let guard = 0; guard < 60; guard++) {
        const res = await adminFetch('/api/admin/backfill-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'preview', cursor }),
        });
        if (!res.ok) { setNote('Could not reach the catalog. Try again in a moment.'); break; }
        const r = await res.json();

        setTotalMissing(r.total_missing || 0);
        setScannedCount(c => c + (r.scanned || 0));
        if (r.proposals?.length) {
          setProposals(prev => [...prev, ...r.proposals]);
          setPicks(prev => {
            const next = { ...prev };
            for (const p of r.proposals as BackfillProposal[]) {
              next[p.id] = { photo: true, name: p.candidate.rename };
            }
            return next;
          });
        }
        cursor = r.cursor;
        if (r.rate_limited) {
          setNote("Sinclair's paused our requests — showing what we found so far. Run again shortly to continue.");
          break;
        }
        if (!r.has_more) { setDone(true); break; }
      }
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => { scan(); }, [scan]);

  async function apply() {
    const chosen = proposals
      .filter(p => picks[p.id]?.photo)
      .map(p => ({
        id: p.id,
        image_url: p.candidate.image_url,
        ...(picks[p.id]?.name ? { details: p.candidate.proper_name } : {}),
      }));
    if (!chosen.length) return;
    setApplying(true);
    try {
      const res = await adminFetch('/api/admin/backfill-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'apply', picks: chosen }),
      });
      if (!res.ok) { setNote('Could not save. Nothing was changed.'); return; }
      onApplied();
      onClose();
    } finally {
      setApplying(false);
    }
  }

  const keptCount = proposals.filter(p => picks[p.id]?.photo).length;
  const renameCount = proposals.filter(p => picks[p.id]?.photo && picks[p.id]?.name).length;
  const noMatch = Math.max(0, scannedCount - proposals.length);

  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h3 className="font-display text-lg font-bold text-brand-navy flex items-center gap-2">
              <ImagePlus className="w-5 h-5 text-brand-gold" />
              Find photos on Sinclair&apos;s site
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {scanning
                ? `Searching Sinclair's — checked ${scannedCount.toLocaleString()} of ${totalMissing.toLocaleString()} items…`
                : `Checked ${scannedCount.toLocaleString()} items · found ${proposals.length} match${proposals.length === 1 ? '' : 'es'} · ${noMatch} with nothing on their site`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed mb-4">
            These are matched by <strong>name</strong>, not barcode — so give them a look before saving.
            Items only appear here when the match came from the right department on Sinclair&apos;s site
            (a search for &ldquo;beef liver&rdquo; also returns dog food; those are filtered out).
            Untick anything that looks wrong.
          </div>

          {note && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">{note}</p>
          )}

          {proposals.length === 0 && !scanning && (
            <p className="text-sm text-gray-400 text-center py-10">
              No matches found on Sinclair&apos;s site for the items missing photos.
            </p>
          )}

          <div className="space-y-2">
            {proposals.map(p => {
              const pick = picks[p.id] || { photo: false, name: false };
              return (
                <div key={p.id}
                  className={`flex items-center gap-4 border rounded-xl p-3 transition-colors ${
                    pick.photo ? 'border-brand-gold/40 bg-brand-sand/20' : 'border-gray-200 bg-gray-50 opacity-60'
                  }`}>
                  {/* Use-photo toggle (independent of the name below) */}
                  <label className="flex flex-col items-center gap-0.5 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pick.photo}
                      onChange={e => setPicks(prev => ({ ...prev, [p.id]: { ...pick, photo: e.target.checked } }))}
                      className="w-4 h-4 accent-brand-navy"
                      aria-label={`Use photo for ${p.description}`}
                    />
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Use&nbsp;photo</span>
                  </label>

                  {/* Proposed photo */}
                  <ZoomableThumb src={p.candidate.image_url} alt={p.candidate.freshop_name} />

                  {/* Ours → theirs */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 truncate">
                      <span className="font-mono">{p.description}</span>
                      {p.pkg_size && <span className="ml-1.5">· {p.pkg_size}</span>}
                      <span className="ml-1.5">· {formatCurrency(p.price)}</span>
                    </p>
                    <p className="text-sm font-semibold text-brand-navy truncate mt-0.5">
                      {p.candidate.freshop_name}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-gray-400">{p.candidate.dept_path}</span>
                      {p.candidate.price_match && (
                        <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-1.5">
                          price matches
                        </span>
                      )}
                      {p.candidate.size_match && (
                        <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-1.5">
                          size matches
                        </span>
                      )}
                      {!p.candidate.price_match && !p.candidate.size_match && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5">
                          name only — check this one
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rename opt-in */}
                  <label className={`flex items-start gap-2 w-56 shrink-0 text-xs cursor-pointer ${
                    pick.photo ? '' : 'pointer-events-none'
                  }`}>
                    <input
                      type="checkbox"
                      checked={pick.name}
                      onChange={e => setPicks(prev => ({ ...prev, [p.id]: { ...pick, name: e.target.checked } }))}
                      className="w-3.5 h-3.5 accent-brand-navy mt-0.5 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-gray-400">Also show as</span>
                      <span className="block font-semibold text-brand-navy leading-tight">
                        {p.candidate.proper_name}
                      </span>
                    </span>
                  </label>
                </div>
              );
            })}
          </div>

          {scanning && (
            <p className="flex items-center justify-center gap-2 text-xs text-gray-400 py-4">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching Sinclair&apos;s site…
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0">
          <p className="text-xs text-gray-500 flex-1">
            {keptCount} photo{keptCount === 1 ? '' : 's'} selected
            {renameCount > 0 && ` · ${renameCount} name${renameCount === 1 ? '' : 's'} corrected`}
          </p>
          <button onClick={onClose} disabled={applying}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={apply} disabled={applying || scanning || keptCount === 0}
            className="px-5 py-2.5 rounded-xl bg-brand-green text-white text-sm font-bold flex items-center gap-1.5 hover:bg-brand-gmed disabled:opacity-50">
            {applying
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : <><Check className="w-4 h-4" /> Save {keptCount > 0 ? keptCount : ''} selected</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHOTO REVIEW — the nightly sync's weaker name-matches, waiting for a human.
// Strong matches auto-applied overnight; these are the judgment calls. No live
// searching here (that already happened, paced, overnight) — just approve/reject.
// ─────────────────────────────────────────────────────────────────────────────
interface PhotoProposal {
  id: string;
  description: string;
  details: string | null;
  category: string;
  pkg_size: string | null;
  price: number;
  proposed_image_url: string;
  proposed_details: string | null;
  proposed_name: string | null;
  proposed_score: number | null;
}

function PhotoReviewPanel({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [proposals, setProposals] = useState<PhotoProposal[] | null>(null);
  const [picks, setPicks] = useState<Record<string, { keep: boolean; name: boolean }>>({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await adminFetch('/api/admin/photo-review');
      const list: PhotoProposal[] = res.ok ? (await res.json()).proposals : [];
      setProposals(list);
      const init: Record<string, { keep: boolean; name: boolean }> = {};
      // Photo kept by default; NAME never changes by default. Every item here is
      // a barge order-form item, and those keep their curated names — renaming
      // is a deliberate per-row opt-in (e.g. a cryptic "MM LEMONADE").
      for (const p of list) init[p.id] = { keep: true, name: false };
      setPicks(init);
    })();
  }, []);

  async function apply() {
    if (!proposals) return;
    setApplying(true);
    try {
      const approve = proposals.filter(p => picks[p.id]?.keep).map(p => ({ id: p.id, keepName: !!picks[p.id]?.name }));
      const reject = proposals.filter(p => !picks[p.id]?.keep).map(p => p.id);
      const res = await adminFetch('/api/admin/photo-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve, reject }),
      });
      if (res.ok) { onApplied(); onClose(); }
    } finally {
      setApplying(false);
    }
  }

  const keptCount = proposals ? proposals.filter(p => picks[p.id]?.keep).length : 0;

  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[92vh]">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h3 className="font-display text-lg font-bold text-brand-navy flex items-center gap-2">
              <ImagePlus className="w-5 h-5 text-brand-gold" /> Photo Review
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {proposals === null ? 'Loading…'
                : `${proposals.length} match${proposals.length === 1 ? '' : 'es'} the nightly sync found — approve the good ones, untick the wrong ones.`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-2">
          {proposals !== null && proposals.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">
              Nothing waiting for review — the nightly sync will drop new matches here as it works through the catalog.
            </p>
          )}
          {(proposals || []).map(p => {
            const pick = picks[p.id] || { keep: false, name: false };
            const strong = (p.proposed_score ?? 0) >= 0.8;
            return (
              <div key={p.id} className={`flex items-center gap-4 border rounded-xl p-3 transition-colors ${
                pick.keep ? 'border-brand-gold/40 bg-brand-sand/20' : 'border-gray-200 bg-gray-50 opacity-60'
              }`}>
                <label className="flex flex-col items-center gap-0.5 shrink-0 cursor-pointer">
                  <input type="checkbox" checked={pick.keep}
                    onChange={e => setPicks(v => ({ ...v, [p.id]: { ...pick, keep: e.target.checked } }))}
                    className="w-4 h-4 accent-brand-navy" />
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Use&nbsp;photo</span>
                </label>
                <ZoomableThumb src={p.proposed_image_url} alt={p.proposed_name || ''} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 truncate">
                    <span className="font-mono">{p.description}</span>
                    {p.pkg_size && <span className="ml-1.5">· {p.pkg_size}</span>}
                    <span className="ml-1.5">· {formatCurrency(p.price)}</span>
                  </p>
                  <p className="text-sm font-semibold text-brand-navy truncate mt-0.5">{p.proposed_name}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-gray-400">{p.category}</span>
                    <span className={`text-[10px] font-bold px-1.5 rounded-full border ${strong ? 'text-green-700 bg-green-50 border-green-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                      {Math.round((p.proposed_score ?? 0) * 100)}% match
                    </span>
                  </div>
                </div>
                <label className={`flex items-start gap-2 w-52 shrink-0 text-xs cursor-pointer ${pick.keep ? '' : 'pointer-events-none'}`}>
                  <input type="checkbox" checked={pick.name}
                    onChange={e => setPicks(v => ({ ...v, [p.id]: { ...pick, name: e.target.checked } }))}
                    className="w-3.5 h-3.5 accent-brand-navy mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-gray-400">Also show as</span>
                    <span className="block font-semibold text-brand-navy leading-tight">{p.proposed_details}</span>
                  </span>
                </label>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0">
          <p className="text-xs text-gray-500 flex-1">{keptCount} to approve · {(proposals?.length || 0) - keptCount} to reject</p>
          <button onClick={onClose} disabled={applying}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={apply} disabled={applying || proposals === null || proposals.length === 0}
            className="px-5 py-2.5 rounded-xl bg-brand-green text-white text-sm font-bold flex items-center gap-1.5 hover:bg-brand-gmed disabled:opacity-50">
            {applying ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> Apply decisions</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// -- Shared image upload cell
function ProductImageCell({ productId, imageUrl, onUploaded }: {
  productId: string | null;
  imageUrl: string | null;
  onUploaded: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(imageUrl);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setPreview(imageUrl); }, [imageUrl]);

  async function handleFile(file: File) {
    if (!productId) { setError('Save the product first, then add an image.'); return; }
    setUploading(true); setError(null);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    const form = new FormData();
    form.append('file', file);
    const res = await adminFetch(`/api/products/${productId}/image`, { method: 'POST', body: form });
    if (res.ok) {
      const data = await res.json();
      URL.revokeObjectURL(objectUrl);
      setPreview(data.image_url);
      onUploaded(data.image_url);
    } else {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      setError(err.error || 'Upload failed');
      setPreview(imageUrl);
    }
    setUploading(false);
  }

  async function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!productId) return;
    setUploading(true);
    const res = await adminFetch(`/api/products/${productId}/image`, { method: 'DELETE' });
    if (res.ok) { setPreview(null); onUploaded(null); }
    setUploading(false);
  }

  return (
    <div className="relative w-12 h-12 flex-shrink-0 group">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
      <button
        type="button"
        title={preview ? 'Replace image' : 'Upload image'}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`w-12 h-12 rounded border-2 overflow-hidden flex items-center justify-center transition-colors
          ${preview ? 'border-gray-200 hover:border-brand-river' : 'border-dashed border-gray-300 hover:border-brand-river bg-gray-50'}`}
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin text-brand-river" />
        ) : preview ? (
          <Image src={preview} alt="product" width={48} height={48} className="object-cover w-full h-full" unoptimized />
        ) : (
          <ImagePlus className="w-5 h-5 text-gray-300 group-hover:text-brand-river" />
        )}
      </button>
      {preview && !uploading && (
        <button
          type="button"
          title="Remove image"
          onClick={handleRemove}
          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
          <X className="w-2.5 h-2.5 text-white" />
        </button>
      )}
      {error && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-red-50 border border-red-200 rounded text-[10px] text-red-600 px-2 py-1 whitespace-nowrap max-w-[180px] shadow-md">
          {error}
        </div>
      )}
    </div>
  );
}


// ── Tag chip editor ──────────────────────────────────────────────────
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('');

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/,/g, '');
    if (!tag || tags.includes(tag)) { setInput(''); return; }
    onChange([...tags, tag]);
    setInput('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter(t => t !== tag));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {tags.map(tag => (
          <span key={tag}
            className="inline-flex items-center gap-1 bg-brand-river/10 text-brand-river text-[11px] font-semibold px-2 py-0.5 rounded-full">
            <Tag className="w-2.5 h-2.5" />
            {tag}
            <button type="button" onClick={() => removeTag(tag)}
              className="ml-0.5 text-brand-river/50 hover:text-red-500 transition-colors">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        className="input-base text-xs py-1 w-full"
        placeholder="Add tag, press Enter (e.g. spices, baking)"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input); }
          if (e.key === 'Backspace' && !input && tags.length) { onChange(tags.slice(0, -1)); }
        }}
        onBlur={() => { if (input.trim()) addTag(input); }}
      />
    </div>
  );
}

const CATEGORIES = [...MAIN_CATEGORIES];

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All Statuses' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive (hidden)' },
  { key: 'available', label: 'In Stock' },
  { key: 'unavailable', label: 'Out of Stock' },
  { key: 'no_image', label: 'Missing Image' },
  { key: 'name_matched', label: 'Auto-matched Photos (review)' },
];

interface EditState {
  description: string;
  details: string;
  category: string;
  sub_category: string;
  location: string;
  pkg_size: string;
  uom: string;
  price: string;
  tags: string[];
  image_url: string | null;
  billed_by_weight: boolean;
}

function AddProductRow({ onAdded }: {
  onAdded: (p: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newProductId, setNewProductId] = useState<string | null>(null);
  const [form, setForm] = useState({
    description: '', details: '', category: 'Pantry & Grocery', sub_category: '',
    location: '', pkg_size: '', uom: '', price: '', tags: [] as string[], image_url: null as string | null,
    billed_by_weight: false,
  });
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) descRef.current?.focus(); }, [open]);

  function reset() { setForm({ description: '', details: '', category: 'Pantry & Grocery', sub_category: '', location: '', pkg_size: '', uom: '', price: '', tags: [], image_url: null, billed_by_weight: false }); setNewProductId(null); setOpen(false); }

  async function save() {
    if (!form.description || !form.price) return;
    setSaving(true);
    const res = await adminFetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'add_anyway',
        products: [{
          description: form.description.toUpperCase(),
          details: form.details || null,
          category: form.category,
          sub_category: form.sub_category || form.category,
          location: form.location || null,
          pkg_size: form.pkg_size || null,
          uom: form.uom || null,
          price: parseFloat(form.price) || 0,
          tags: form.tags,
          is_active: true,
          is_available: true,
          billed_by_weight: form.billed_by_weight,
          upc: null,
        }],
      }),
    });
    if (res.ok) {
      const listRes = await adminFetch(`/api/products?search=${encodeURIComponent(form.description)}&per_page=1`);
      if (listRes.ok) {
        const data = await listRes.json();
        if (data.products?.[0]) {
          setNewProductId(data.products[0].id);
          onAdded(data.products[0]);
        }
      }
    }
    setSaving(false);
  }

  if (!open) {
    return (
      <tr>
        <td colSpan={10} className="px-3 py-2 border-b border-dashed border-gray-200">
          <button onClick={() => setOpen(true)}
            className="flex items-center gap-2 text-sm text-brand-river hover:text-brand-navy font-medium transition-colors w-full py-1">
            <Plus className="w-4 h-4" /> Add new product
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-green-50 border-b border-green-200">
      <td className="px-2 py-2"></td>
      <td className="px-2 py-2">
        <ProductImageCell
          productId={newProductId}
          imageUrl={form.image_url}
          onUploaded={url => setForm(f => ({ ...f, image_url: url }))}
        />
      </td>
      <td className="px-2 py-2">
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, sub_category: '' }))}
          className="input-base text-xs py-1.5 w-full">
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <input className="input-base text-xs py-1.5 w-full" placeholder="Sub-category"
          value={form.sub_category} onChange={e => setForm(f => ({ ...f, sub_category: e.target.value }))} />
        <input className="input-base text-xs py-1 w-full mt-1" placeholder="Location (e.g. Cold Deli)"
          value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
      </td>
      <td className="px-2 py-2">
        <input ref={descRef} className="input-base text-xs py-1.5 w-full font-medium"
          placeholder="Product name (required)" value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') reset(); }} />
        <textarea className="input-base text-xs py-1 w-full mt-1 resize-none" rows={2}
          placeholder="Description (optional — shown to customers)"
          value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} />
        <div className="mt-1">
          <TagEditor tags={form.tags} onChange={tags => setForm(f => ({ ...f, tags }))} />
        </div>
      </td>
      <td className="px-2 py-2">
        <input className="input-base text-xs py-1.5 w-24" placeholder="e.g. 48 OZ"
          value={form.pkg_size} onChange={e => setForm(f => ({ ...f, pkg_size: e.target.value }))} />
      </td>
      <td className="px-2 py-2">
        <input className="input-base text-xs py-1.5 w-16" placeholder="e.g. CS"
          value={form.uom} onChange={e => setForm(f => ({ ...f, uom: e.target.value }))} />
      </td>
      <td className="px-2 py-2">
        <input className="input-base text-xs py-1.5 w-20" placeholder="0.00" type="number" min="0" step="0.01"
          value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') reset(); }} />
        <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer" title="Customer enters a quantity; final price is by actual weight">
          <input type="checkbox" checked={form.billed_by_weight}
            onChange={e => setForm(f => ({ ...f, billed_by_weight: e.target.checked }))}
            className="w-3.5 h-3.5 rounded border-gray-300" />
          <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">/lb</span>
        </label>
      </td>
      <td className="px-2 py-2"></td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-1.5">
          <button onClick={save} disabled={saving || !form.description || !form.price}
            className="p-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={reset} className="p-1.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function EditableRow({ product, selected, onSelect, onSaved, onToggleActive, onToggleAvailable }: {
  product: Product;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onSaved: (p: Product) => void;
  onToggleActive: (p: Product) => void;
  onToggleAvailable: (p: Product) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditState>({
    description: product.description,
    details: product.details || '',
    category: product.category,
    sub_category: product.sub_category || '',
    location: product.location || '',
    pkg_size: product.pkg_size || '',
    uom: product.uom || '',
    price: product.price.toFixed(2),
    tags: product.tags || [],
    image_url: product.image_url ?? null,
    billed_by_weight: !!product.billed_by_weight,
  });

  async function save() {
    setSaving(true);
    const res = await adminFetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: product.id,
        description: form.description,
        details: form.details || null,
        category: form.category,
        sub_category: form.sub_category,
        pkg_size: form.pkg_size || null,
        uom: form.uom || null,
        price: parseFloat(form.price) || 0,
        tags: form.tags,
        billed_by_weight: form.billed_by_weight,
      }),
    });
    if (res.ok) {
      const { product: updated } = await res.json();
      onSaved(updated);
      setEditing(false);
    }
    setSaving(false);
  }

  if (editing) {
    return (
      <tr className="bg-blue-50 border-b border-blue-100">
        <td className="px-3 py-2"></td>
        <td className="px-3 py-2">
          <ProductImageCell
            productId={product.id}
            imageUrl={form.image_url}
            onUploaded={url => setForm(f => ({ ...f, image_url: url }))}
          />
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-full" value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-full" value={form.sub_category}
            onChange={e => setForm(f => ({ ...f, sub_category: e.target.value }))} />
          <input className="input-base text-xs py-1 w-full mt-1" placeholder="Location"
            value={form.location}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-full font-medium" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <textarea className="input-base text-xs py-1 w-full mt-1 resize-none" rows={2}
            placeholder="Description (optional — shown to customers)"
            value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} />
          <div className="mt-1.5">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Search Tags</p>
            <TagEditor tags={form.tags} onChange={tags => setForm(f => ({ ...f, tags }))} />
          </div>
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-24" value={form.pkg_size}
            onChange={e => setForm(f => ({ ...f, pkg_size: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-16" value={form.uom}
            onChange={e => setForm(f => ({ ...f, uom: e.target.value }))} />
        </td>
        <td className="px-3 py-2">
          <input className="input-base text-xs py-1 w-20" value={form.price}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
          <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer" title="Customer enters a quantity; final price is by actual weight">
            <input type="checkbox" checked={form.billed_by_weight}
              onChange={e => setForm(f => ({ ...f, billed_by_weight: e.target.checked }))}
              className="w-3.5 h-3.5 rounded border-gray-300" />
            <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Billed by weight (/lb)</span>
          </label>
        </td>
        <td className="px-3 py-2"></td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button onClick={save} disabled={saving}
              className="p-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => setEditing(false)}
              className="p-1.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${!product.is_active ? 'opacity-40' : ''}`}>
      <td className="px-3 py-2.5">
        <input type="checkbox" checked={selected}
          onChange={e => onSelect(product.id, e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-brand-river focus:ring-brand-river" />
      </td>
      <td className="px-3 py-2.5">
        <div className="group">
          <ProductImageCell
            productId={product.id}
            imageUrl={product.image_url ?? null}
            onUploaded={url => onSaved({ ...product, image_url: url })}
          />
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs text-brand-river font-medium">{product.category}</td>
      <td className="px-3 py-2.5 text-xs text-gray-400">
        <div>{product.sub_category}</div>
        {product.location && (
          <div className="text-[10px] text-teal-600 font-medium mt-0.5">📍 {product.location}</div>
        )}
      </td>
      <td className="px-3 py-2.5 text-sm font-medium text-brand-navy max-w-xs">
        <span className="line-clamp-1">{product.description}</span>
        <div className="flex flex-wrap items-center gap-1 mt-0.5">
          {!product.is_active && (
            <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Inactive</span>
          )}
          {product.billed_by_weight && (
            <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">/lb</span>
          )}
          {/* Name-matched photo — pulled from Sinclair's by NAME (not barcode),
              so it may be the wrong item. Flagged for a human to confirm. */}
          {product.image_url && product.image_source === 'name_match' && (
            <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-purple-700 bg-purple-50 rounded px-1.5 py-0.5"
              title="Photo was auto-matched from Sinclair's site by name (not barcode). Confirm it's the right item, or upload the real photo to replace it.">
              🔍 Auto-matched — review
            </span>
          )}
          {/* Missing-image reason — WHY there's no photo, so staff know
              whether to grab a camera or shrug (Sinclair's has none either) */}
          {product.is_active && !product.image_url && (
            product.freshop_id ? (
              <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 rounded px-1.5 py-0.5"
                title="This item is matched to Sinclair's website, but their site has no photo for it either.">
                No photo on Sinclair&apos;s site
              </span>
            ) : (
              <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-orange-700 bg-orange-50 rounded px-1.5 py-0.5"
                title="Not matched to Sinclair's website (no UPC, e.g. custom meat cuts / bakery) — someone needs to take a photo and upload it here.">
                📷 Needs a photo — not on Sinclair&apos;s site
              </span>
            )
          )}
          {(product.tags || []).map(tag => (
            <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] text-brand-river/70 bg-blue-50 rounded-full px-1.5 py-0.5 font-semibold">
              <Tag className="w-2 h-2" />{tag}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{product.pkg_size || '—'}</td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{product.uom || '—'}</td>
      <td className="px-3 py-2.5 text-sm font-bold text-brand-navy">{formatCurrency(product.price)}</td>
      {/* One-tap in/out-of-stock pill — the most frequent daily action */}
      <td className="px-3 py-2.5">
        <button
          onClick={() => onToggleAvailable(product)}
          title={product.is_available ? 'Tap to mark Out of Stock' : 'Tap to mark In Stock'}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border-2 whitespace-nowrap transition-all active:scale-95 ${
            product.is_available
              ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
              : 'bg-red-50 text-red-600 border-red-300 hover:bg-red-100'
          }`}>
          {product.is_available
            ? <><PackageCheck className="w-3.5 h-3.5" /> In Stock</>
            : <><PackageX className="w-3.5 h-3.5" /> Out of Stock</>}
        </button>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setEditing(true)} title="Edit"
            className="p-1.5 text-gray-400 hover:text-brand-river hover:bg-blue-50 rounded transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onToggleActive(product)} title={product.is_active ? 'Deactivate (hide from catalog)' : 'Activate'}
            className={`p-1.5 rounded transition-colors ${product.is_active
              ? 'text-green-500 hover:text-red-500 hover:bg-red-50'
              : 'text-gray-300 hover:text-green-500 hover:bg-green-50'}`}>
            {product.is_active
              ? <ToggleRight className="w-4 h-4" />
              : <ToggleLeft className="w-4 h-4" />}
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminProductsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'catalog' | 'import' | 'duplicates'>('catalog');

  // Catalog state
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  // Barge order form vs full-store filter (Jen's notes) — '' = both
  const [storeFilter, setStoreFilter] = useState('');
  const [page, setPage] = useState(1);
  const searchRef = useRef<ReturnType<typeof setTimeout>>();
  const perPage = 50;

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');

  // Duplicates tab state
  const [dupGroups, setDupGroups] = useState<any[]>([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupSelected, setDupSelected] = useState<Set<string>>(new Set());
  const [dupFilter, setDupFilter] = useState<'all' | 'upc' | 'name_pack' | 'upc_conflict'>('all');

  const [denied, setDenied] = useState(false);
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [showBackfill, setShowBackfill] = useState(false);
  const [showPhotoReview, setShowPhotoReview] = useState(false);
  const [photoReviewCount, setPhotoReviewCount] = useState(0);
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();

  const loadPhotoReviewCount = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/photo-review');
      if (res.ok) setPhotoReviewCount((await res.json()).count || 0);
    } catch { /* non-critical */ }
  }, []);
  useEffect(() => { loadPhotoReviewCount(); }, [loadPhotoReviewCount]);

  // Auth guard — verify the session cookie with the server
  useEffect(() => {
    (async () => {
      const session = await fetchAdminSession();
      if (!session) { router.push('/admin'); return; }
      if (!canAccess(session.role, 'products')) { setDenied(true); return; }
      setSessionRole(session.role);
    })();
  }, [router]);

  const fetchProducts = useCallback(async (q = search, p = page, cat = category, st = status) => {
    setLoading(true);
    const params = new URLSearchParams({ search: q, page: String(p), per_page: '50' });
    if (cat) params.set('category', cat);
    if (st) params.set('status', st);
    if (storeFilter) params.set('store', storeFilter);
    const res = await adminFetch(`/api/products?${params}`);
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
  }, [search, page, category, status, storeFilter]);

  useEffect(() => { fetchProducts(); }, [page, category, status, storeFilter]);

  useEffect(() => {
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setPage(1); fetchProducts(search, 1, category, status); }, 350);
  }, [search]);

  // Clear selection whenever the visible product list changes
  useEffect(() => { setSelected(new Set()); }, [products]);

  async function toggleActive(product: Product) {
    const res = await adminFetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: product.id, is_active: !product.is_active }),
    });
    if (res.ok) {
      setProducts(ps => ps.map(p => p.id === product.id ? { ...p, is_active: !p.is_active } : p));
    }
  }

  async function toggleAvailable(product: Product) {
    const res = await adminFetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: product.id, is_available: !product.is_available }),
    });
    if (res.ok) {
      setProducts(ps => ps.map(p => p.id === product.id ? { ...p, is_available: !p.is_available } : p));
    }
  }

  function handleSaved(updated: Product) {
    setProducts(ps => ps.map(p => p.id === updated.id ? updated : p));
  }

  function handleAdded(newProduct: Product) {
    setProducts(ps => [newProduct, ...ps]);
    setTotal(t => t + 1);
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelected(checked ? new Set(products.map(p => p.id)) : new Set());
  }

  // ── Bulk actions on the catalog tab ──
  async function bulkDelete() {
    if (!selected.size) return;
    if (!(await confirmDialog({
      title: `Delete ${selected.size} selected product${selected.size === 1 ? '' : 's'}?`,
      message: 'This cannot be undone.',
      danger: true,
    }))) return;
    setBulkBusy(true);
    const res = await adminFetch('/api/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    if (res.ok) {
      setProducts(ps => ps.filter(p => !selected.has(p.id)));
      setTotal(t => Math.max(0, t - selected.size));
      setSelected(new Set());
    }
    setBulkBusy(false);
  }

  async function bulkUpdate(updates: Record<string, any>) {
    if (!selected.size) return;
    setBulkBusy(true);
    const res = await adminFetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected), updates }),
    });
    if (res.ok) {
      setProducts(ps => ps.map(p => selected.has(p.id) ? { ...p, ...updates } : p));
    }
    setBulkBusy(false);
  }

  async function exportCatalog() {
    const res = await adminFetch('/api/products/export');
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grafton-towboat-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ── Duplicates review tab ──
  const fetchDuplicates = useCallback(async () => {
    setDupLoading(true);
    setDupSelected(new Set());
    const res = await adminFetch('/api/products/duplicates');
    if (res.ok) {
      const data = await res.json();
      setDupGroups(data.groups || []);
    }
    setDupLoading(false);
  }, []);

  useEffect(() => { if (tab === 'duplicates') fetchDuplicates(); }, [tab, fetchDuplicates]);

  function toggleDupSelect(id: string, checked: boolean) {
    setDupSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function deleteDupSelected() {
    if (!dupSelected.size) return;
    if (!(await confirmDialog({
      title: `Delete ${dupSelected.size} selected duplicate item${dupSelected.size === 1 ? '' : 's'}?`,
      message: 'This cannot be undone.',
      danger: true,
    }))) return;
    setDupLoading(true);
    const res = await adminFetch('/api/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(dupSelected) }),
    });
    if (res.ok) {
      await fetchDuplicates();
      fetchProducts();
    } else {
      setDupLoading(false);
    }
  }

  const filteredDupGroups = dupGroups.filter(g => dupFilter === 'all' || g.type === dupFilter);
  const deletableGroups = filteredDupGroups.filter(g => g.type !== 'upc_conflict');

  async function deleteAllDuplicates() {
    // Keep the first (oldest) item in each true-duplicate group, delete the rest.
    // "upc_conflict" groups (same UPC, different products) are never auto-deleted.
    const idsToDelete: string[] = [];
    for (const group of deletableGroups) {
      const [, ...rest] = group.items;
      for (const item of rest) idsToDelete.push(item.id);
    }
    if (!idsToDelete.length) return;
    if (!(await confirmDialog({
      title: `Delete ${idsToDelete.length} duplicate item${idsToDelete.length === 1 ? '' : 's'} across ${deletableGroups.length} group${deletableGroups.length === 1 ? '' : 's'}?`,
      message: 'The first item in each group will be kept. This cannot be undone.',
      danger: true,
    }))) return;
    setDupLoading(true);
    const res = await adminFetch('/api/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: idsToDelete }),
    });
    if (res.ok) {
      await fetchDuplicates();
      fetchProducts();
    } else {
      setDupLoading(false);
    }
  }

  const totalPages = Math.ceil(total / perPage);
  const allSelectedOnPage = products.length > 0 && products.every(p => selected.has(p.id));

  if (denied) return (
    <div className="flex flex-col items-center justify-center py-32 text-center px-4">
      <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4">
        <Lock className="w-6 h-6 text-red-400" />
      </div>
      <h2 className="font-bold text-brand-navy text-lg mb-1">Access Restricted</h2>
      <p className="text-gray-400 text-sm max-w-xs">
        Staff accounts can view orders only. Contact a manager or owner for product catalog access.
      </p>
    </div>
  );

  return (
    <div>
      {confirmDialogEl}
      {showBackfill && (
        <PhotoBackfillPanel
          onClose={() => setShowBackfill(false)}
          onApplied={() => fetchProducts()} />
      )}
      {showPhotoReview && (
        <PhotoReviewPanel
          onClose={() => setShowPhotoReview(false)}
          onApplied={() => { fetchProducts(); loadPhotoReviewCount(); }} />
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-brand-navy">Product Catalog</h1>
          <p className="text-gray-400 text-sm">{total.toLocaleString()} products total</p>
        </div>
        <div className="flex items-center gap-2">
          <CatalogSyncStatus isOwner={sessionRole === 'owner'} />
          {photoReviewCount > 0 && (
            <button onClick={() => setShowPhotoReview(true)}
              title="Approve or reject the photo matches the nightly sync found"
              className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5 border-brand-gold/50 text-brand-navy">
              <ImagePlus className="w-4 h-4" /> Photo Review
              <span className="text-[10px] font-bold bg-brand-gold text-brand-navy rounded-full px-1.5">{photoReviewCount}</span>
            </button>
          )}
          <button onClick={() => setShowBackfill(true)}
            title="Search Sinclair's site for photos and proper names on items the nightly barcode sync can't match"
            className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
            <ImagePlus className="w-4 h-4" /> Find Photos
          </button>
          <button onClick={exportCatalog} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => fetchProducts()} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-6 w-fit">
        {[{ key: 'catalog', label: 'Browse & Edit', icon: Package },
          { key: 'import', label: 'Import File', icon: Upload },
          { key: 'duplicates', label: 'Duplicates', icon: Layers }].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? 'bg-brand-navy text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── CATALOG TAB ── */}
      {tab === 'catalog' && (
        <div className="card-base overflow-hidden">
          {/* Search + filters */}
          <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <div className="relative max-w-md flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="search" placeholder="Search by name or UPC…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-base pl-9 text-sm w-full" />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}
                className="input-base text-sm py-2">
                <option value="">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
                className="input-base text-sm py-2">
                {STATUS_FILTERS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <select value={storeFilter} onChange={e => { setStoreFilter(e.target.value); setPage(1); }}
                className="input-base text-sm py-2"
                title="Barge order form items vs the full-store import">
                <option value="">Barge + Store</option>
                <option value="barge">Barge Order Form</option>
                <option value="store">Full Store Only</option>
              </select>
            </div>
          </div>

          {/* Quick filters — one-click category + spot-check views */}
          <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mr-1">Quick filters</span>
            {['', ...CATEGORIES].map(c => (
              <button key={c || 'all'}
                onClick={() => { setCategory(c); setStatus(''); setPage(1); }}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  category === c && !status ? 'bg-brand-navy text-white border-brand-navy' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                {c || 'All'}
              </button>
            ))}
            <span className="w-px h-4 bg-gray-200 mx-1" />
            <button onClick={() => { setStatus('no_image'); setPage(1); }}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                status === 'no_image' ? 'bg-orange-600 text-white border-orange-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>
              📷 Missing Image
            </button>
            <button onClick={() => { setStatus('name_matched'); setPage(1); }}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                status === 'name_matched' ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>
              🔍 Auto-matched
            </button>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="px-4 py-3 bg-brand-sand/40 border-b border-gray-100 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-brand-navy mr-2">
                {selected.size} selected
              </span>
              <button onClick={() => bulkUpdate({ is_active: true })} disabled={bulkBusy}
                className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
                <ToggleRight className="w-3.5 h-3.5" /> Activate
              </button>
              <button onClick={() => bulkUpdate({ is_active: false })} disabled={bulkBusy}
                className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
                <ToggleLeft className="w-3.5 h-3.5" /> Deactivate
              </button>
              <button onClick={() => bulkUpdate({ is_available: true })} disabled={bulkBusy}
                className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
                <PackageCheck className="w-3.5 h-3.5" /> Mark In Stock
              </button>
              <button onClick={() => bulkUpdate({ is_available: false })} disabled={bulkBusy}
                className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
                <PackageX className="w-3.5 h-3.5" /> Mark Out of Stock
              </button>
              <div className="flex items-center gap-1.5">
                <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}
                  className="input-base text-xs py-1.5">
                  <option value="">Set category…</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => bulkCategory && bulkUpdate({ category: bulkCategory })}
                  disabled={bulkBusy || !bulkCategory}
                  className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40">
                  Apply
                </button>
              </div>
              <button onClick={bulkDelete} disabled={bulkBusy}
                className="ml-auto text-xs px-3 py-1.5 rounded font-medium bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1.5 transition-colors">
                {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete Selected
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-brand-river" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">No products found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-brand-navy text-left">
                    <th className="px-3 py-3">
                      <input type="checkbox" checked={allSelectedOnPage}
                        onChange={e => toggleSelectAll(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300" />
                    </th>
                    {['Image', 'Category', 'Sub-Category', 'Description', 'Pack Size', 'UOM', 'Price', 'Stock', 'Actions'].map(h => (
                      <th key={h} className="px-3 py-3 text-xs font-bold text-brand-sky uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AddProductRow onAdded={handleAdded} />
                  {products.map(product => (
                    <EditableRow
                      key={product.id}
                      product={product}
                      selected={selected.has(product.id)}
                      onSelect={toggleSelect}
                      onSaved={handleSaved}
                      onToggleActive={toggleActive}
                      onToggleAvailable={toggleAvailable}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, total)} of {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── IMPORT TAB — 4-step wizard (CSV / TSV / XLSX / XLS) ── */}
      {tab === 'import' && (
        <ImportWizard onComplete={() => { setTab('catalog'); fetchProducts('', 1, category, status); }} />
      )}

      {/* ── DUPLICATES TAB ── */}
      {tab === 'duplicates' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">Filter:</span>
              {[
                { key: 'all', label: 'All' },
                { key: 'upc', label: 'Same UPC + Name (true dupes)' },
                { key: 'name_pack', label: 'Same Name & Pack & Price' },
                { key: 'upc_conflict', label: 'Reused UPC, different items' },
              ].map(f => (
                <button key={f.key} onClick={() => setDupFilter(f.key as any)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    dupFilter === f.key ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchDuplicates} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
              {deletableGroups.length > 0 && (
                <button onClick={deleteAllDuplicates} disabled={dupLoading}
                  className="text-sm px-3 py-2 rounded font-medium bg-red-600 text-white hover:bg-red-700 flex items-center gap-1.5 transition-colors disabled:opacity-50">
                  {dupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete All True Duplicates
                </button>
              )}
              {dupSelected.size > 0 && (
                <button onClick={deleteDupSelected} disabled={dupLoading}
                  className="text-sm px-3 py-2 rounded font-medium bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1.5 transition-colors">
                  <Trash2 className="w-4 h-4" /> Delete {dupSelected.size} Selected
                </button>
              )}
            </div>
          </div>

          {dupLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-brand-river" />
            </div>
          ) : filteredDupGroups.length === 0 ? (
            <div className="card-base text-center py-16">
              <Layers className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">No duplicates found</p>
            </div>
          ) : (
            filteredDupGroups.map(group => (
              <div key={group.key} className={`card-base overflow-hidden ${group.type === 'upc_conflict' ? 'ring-1 ring-amber-300' : ''}`}>
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-brand-navy">
                      {group.type === 'upc' && `Same UPC & Name: ${group.items[0].upc}`}
                      {group.type === 'name_pack' && 'Same Name, Pack Size & Price'}
                      {group.type === 'upc_conflict' && `Reused UPC ${group.items[0].upc} — different items`}
                    </p>
                    {group.type === 'upc_conflict' && (
                      <p className="text-xs text-amber-600 mt-0.5">
                        These products share a UPC in the source catalog but are different items. Not deleted automatically — review manually if needed.
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{group.items.length} items</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-3 py-2"></th>
                        {['UPC', 'Name', 'Pack Size', 'Category', 'Price', 'Status'].map(h => (
                          <th key={h} className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {group.items.map((item: any) => (
                        <tr key={item.id} className={dupSelected.has(item.id) ? 'bg-red-50' : ''}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={dupSelected.has(item.id)}
                              onChange={e => toggleDupSelect(item.id, e.target.checked)}
                              className="w-4 h-4 rounded border-gray-300 text-brand-river focus:ring-brand-river" />
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{item.upc || '—'}</td>
                          <td className="px-3 py-2 font-medium text-brand-navy max-w-xs truncate">{item.description}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{item.pkg_size || '—'}</td>
                          <td className="px-3 py-2 text-xs text-brand-river">{item.category}</td>
                          <td className="px-3 py-2 font-bold text-brand-navy">{formatCurrency(item.price)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              {!item.is_active && (
                                <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Inactive</span>
                              )}
                              {!item.is_available && (
                                <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-red-500 bg-red-50 rounded px-1.5 py-0.5">Out of Stock</span>
                              )}
                              {item.is_active && item.is_available && (
                                <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-green-600 bg-green-50 rounded px-1.5 py-0.5">Active</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
