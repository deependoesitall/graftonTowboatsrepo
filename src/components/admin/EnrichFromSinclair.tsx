'use client';
// src/components/admin/EnrichFromSinclair.tsx
// One-click catalog enrichment: matches our products to Sinclair's website
// catalog by UPC and pulls in their product images + clean descriptions.
// Preview first (nothing written), then apply.
import { useState } from 'react';
import { Sparkles, Loader2, X, CheckCircle2, AlertCircle, ImagePlus, FileText, Scale } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';

interface EnrichSummary {
  our_products: number;
  without_upc: number;
  matched: number;
  products_to_update: number;
  images_to_set: number;
  details_to_set: number;
  weight_flags_to_set: number;
  sinclair_products_indexed: number;
  applied?: number;
}

export function EnrichFromSinclair({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'previewing' | 'ready' | 'applying' | 'done'>('idle');
  const [summary, setSummary] = useState<EnrichSummary | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState('');

  async function preview() {
    setOpen(true); setPhase('previewing'); setError(''); setSummary(null);
    try {
      const res = await adminFetch('/api/admin/products/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setSummary(data.summary);
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
      setPhase('idle');
    }
  }

  async function apply() {
    setPhase('applying'); setError('');
    try {
      const res = await adminFetch('/api/admin/products/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'apply', overwrite }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enrichment failed');
      setSummary(data.summary);
      setPhase('done');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrichment failed');
      setPhase('ready');
    }
  }

  function close() {
    setOpen(false); setPhase('idle'); setSummary(null); setError('');
  }

  return (
    <>
      <button onClick={preview}
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

            {phase === 'previewing' && (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-brand-river mx-auto mb-3" />
                <p className="text-sm text-gray-500">Matching your catalog against Sinclair&apos;s website by UPC…</p>
                <p className="text-xs text-gray-400 mt-1">Scanning ~12,000 Sinclair products — takes a few seconds.</p>
              </div>
            )}

            {(phase === 'ready' || phase === 'applying') && summary && (
              <>
                <p className="text-sm text-gray-600 mb-3">
                  Matched <strong className="text-brand-navy">{summary.matched.toLocaleString()}</strong> of
                  your {summary.our_products.toLocaleString()} products by UPC
                  {summary.without_upc > 0 && <span className="text-gray-400"> ({summary.without_upc} have no UPC and were skipped)</span>}.
                  Nothing has been changed yet.
                </p>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm bg-green-50 rounded-lg px-3 py-2">
                    <ImagePlus className="w-4 h-4 text-green-600 shrink-0" />
                    <span><strong>{summary.images_to_set.toLocaleString()}</strong> product images will be pulled in</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm bg-blue-50 rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <span><strong>{summary.details_to_set.toLocaleString()}</strong> customer-friendly descriptions will be added</span>
                  </div>
                  {summary.weight_flags_to_set > 0 && (
                    <div className="flex items-center gap-2 text-sm bg-amber-50 rounded-lg px-3 py-2">
                      <Scale className="w-4 h-4 text-amber-600 shrink-0" />
                      <span><strong>{summary.weight_flags_to_set}</strong> items will be flagged as billed-by-weight (per Sinclair&apos;s data)</span>
                    </div>
                  )}
                </div>
                <label className="flex items-start gap-2 mb-5 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={overwrite}
                    onChange={e => setOverwrite(e.target.checked)} />
                  <span className="text-xs text-gray-500">
                    <strong className="text-brand-navy">Overwrite existing</strong> — also replace images and
                    descriptions you&apos;ve already set. Leave unchecked to only fill in blanks.
                  </span>
                </label>
                <button onClick={apply} disabled={phase === 'applying'}
                  className="btn-gold w-full py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                  {phase === 'applying'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating {summary.products_to_update.toLocaleString()} products…</>
                    : <><Sparkles className="w-4 h-4" /> Apply to {summary.products_to_update.toLocaleString()} products</>}
                </button>
              </>
            )}

            {phase === 'done' && summary && (
              <div className="text-center py-4">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="font-bold text-brand-navy mb-1">Catalog enriched!</p>
                <p className="text-sm text-gray-500 mb-4">
                  {summary.applied?.toLocaleString()} products updated — {summary.images_to_set.toLocaleString()} images,{' '}
                  {summary.details_to_set.toLocaleString()} descriptions. Recorded in the activity log.
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
