'use client';
// src/components/admin/PaperFormImport.tsx
//
// Upload → detect inked QNTY cells → review → push quantities into the builder.
// OCR may prefill a qty; the human always confirms. Non-numeric marks become
// notes, never silent quantities.

import { useCallback, useState } from 'react';
import {
  Camera, FileUp, Loader2, Check, X, AlertTriangle, Trash2,
} from 'lucide-react';
import layoutJson from '@/data/order-form-layout.json';
import type { FormLayoutItem } from '@/lib/form-layout-apply';
import {
  type CatalogItem,
  type ScanCandidate,
  type ScanProgress,
  fileToCanvas,
  renderPdfToCanvases,
  scanPaperPages,
} from '@/lib/paper-form-scan';

const layoutItems = (layoutJson as { items: FormLayoutItem[] }).items;

export interface PaperFormImportProps {
  catalog: CatalogItem[];
  /** Apply confirmed lines into builder qty state. */
  setLine: (productId: string, qty: number) => void;
  /** Append scan notes (subs / Cream / Cs) onto the order header notes. */
  appendNotes?: (note: string) => void;
  onApplied?: (count: number) => void;
}

type ReviewRow = ScanCandidate & {
  qtyInput: string;
  include: boolean;
  noteInput: string;
};

export function PaperFormImport({ catalog, setLine, appendNotes, onApplied }: PaperFormImportProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [runOcr, setRunOcr] = useState(true);

  const reset = () => { setRows(null); setError(''); setProgress(null); };

  const onFiles = useCallback(async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError('');
    setRows(null);
    try {
      const files = Array.from(list);
      const canvases: HTMLCanvasElement[] = [];
      for (const f of files) {
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          const pages = await renderPdfToCanvases(f, (page, pages) => {
            setProgress({ phase: 'render', page, pages, message: `Opening PDF page ${page} of ${pages}…` });
          });
          canvases.push(...pages);
        } else if (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(f.name)) {
          setProgress({ phase: 'render', page: canvases.length + 1, pages: files.length, message: `Opening ${f.name}…` });
          canvases.push(await fileToCanvas(f));
        } else {
          throw new Error(`Unsupported file: ${f.name}. Use PDF or photos.`);
        }
      }
      if (!canvases.length) throw new Error('No pages to read.');

      const found = await scanPaperPages({
        canvases,
        layoutItems,
        catalog,
        runOcr,
        onProgress: setProgress,
      });

      if (!found.length) {
        setError('No marked quantity cells found. Try a sharper scan, or enter the form by hand.');
        return;
      }

      setRows(found.map(c => ({
        ...c,
        include: !!c.match,
        qtyInput: c.suggestedQty != null ? String(c.suggestedQty) : '',
        noteInput: c.markNote || '',
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that scan.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [catalog, runOcr]);

  function commit() {
    if (!rows) return;
    const notes: string[] = [];
    let n = 0;
    for (const r of rows) {
      if (!r.include || !r.match) continue;
      const qty = Number(r.qtyInput);
      if (!qty || qty <= 0) {
        if (r.noteInput.trim()) {
          notes.push(`${r.match.description}: ${r.noteInput.trim()}`);
        }
        continue;
      }
      setLine(r.match.id, qty);
      n++;
      if (r.noteInput.trim()) notes.push(`${r.match.description}: ${r.noteInput.trim()}`);
    }
    if (notes.length && appendNotes) {
      appendNotes(`Scan marks: ${notes.join('; ')}`);
    }
    onApplied?.(n);
    reset();
  }

  const included = rows?.filter(r => r.include && r.match && Number(r.qtyInput) > 0).length || 0;

  return (
    <div className="card-base p-4 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-brand-navy">Scan the paper form</h2>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          Upload the marked Sinclair order form (PDF or photos). We find inked quantity
          cells, match each row to the catalogue, and show you a review — nothing is
          added until you confirm. Quantities from handwriting are suggestions only.
        </p>
      </div>

      {!rows && (
        <div className="space-y-3">
          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-10 cursor-pointer hover:border-brand-green/40 hover:bg-white transition-colors">
            <div className="flex items-center gap-3 text-brand-navy">
              <FileUp className="w-5 h-5" />
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-brand-navy">Drop PDF or photos here</span>
            <span className="text-xs text-gray-400">Multi-page PDF works — about 20 pages is fine</span>
            <input
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              disabled={busy}
              onChange={e => onFiles(e.target.files)}
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={runOcr}
              onChange={e => setRunOcr(e.target.checked)}
              className="rounded border-gray-300 text-brand-green focus:ring-brand-green"
            />
            Read handwritten quantities (slower, still needs your review)
          </label>
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin text-brand-green" />
          {progress?.message || 'Working…'}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {rows && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              {rows.length} marked cell{rows.length === 1 ? '' : 's'} · {rows.filter(r => r.match).length} matched
            </p>
            <button type="button" onClick={reset} className="text-xs text-gray-500 hover:text-brand-navy flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> Start over
            </button>
          </div>

          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {rows.map((r, idx) => (
              <div key={`${r.layoutSeq}-${idx}`} className={`p-3 flex gap-3 ${r.include ? 'bg-white' : 'bg-gray-50 opacity-70'}`}>
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={e => {
                    const v = e.target.checked;
                    setRows(prev => prev!.map((x, i) => i === idx ? { ...x, include: v } : x));
                  }}
                  className="mt-2 rounded border-gray-300 text-brand-green focus:ring-brand-green"
                />
                <img
                  src={r.cropDataUrl}
                  alt=""
                  className="w-16 h-10 object-contain rounded border border-gray-200 bg-white shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-semibold text-brand-navy truncate">
                      {r.match?.description || r.layout.description}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-gray-400">
                      form #{r.layoutSeq} · p{r.pageIndex + 1}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {r.layout.pkg_size || '—'}
                    {r.layout.upc ? ` · UPC ${r.layout.upc}` : ' · no UPC on form'}
                    {r.matchHow !== 'unmatched' ? ` · matched by ${r.matchHow}` : ' · unmatched'}
                  </p>
                  {r.disagreement && (
                    <p className="text-xs text-amber-700 flex gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {r.disagreement}
                    </p>
                  )}
                  {!r.match && (
                    <p className="text-xs text-amber-700 flex gap-1">
                      <X className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      No catalogue match — uncheck or fix by hand in Order form.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <label className="text-xs text-gray-500 flex items-center gap-1.5">
                      Qty
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={r.qtyInput}
                        onChange={e => {
                          const v = e.target.value;
                          setRows(prev => prev!.map((x, i) => i === idx ? { ...x, qtyInput: v } : x));
                        }}
                        className="input-base w-20 py-1 text-sm"
                        placeholder="—"
                      />
                    </label>
                    <label className="text-xs text-gray-500 flex items-center gap-1.5 flex-1 min-w-[10rem]">
                      Note
                      <input
                        type="text"
                        value={r.noteInput}
                        onChange={e => {
                          const v = e.target.value;
                          setRows(prev => prev!.map((x, i) => i === idx ? { ...x, noteInput: v } : x));
                        }}
                        className="input-base flex-1 py-1 text-sm"
                        placeholder="Cream, Cs, sub…"
                      />
                    </label>
                  </div>
                </div>
                {r.match && Number(r.qtyInput) > 0 ? (
                  <Check className="w-4 h-4 text-green-600 shrink-0 mt-2" />
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
              disabled={included === 0}
              onClick={commit}
            >
              Add {included} line{included === 1 ? '' : 's'} to the order
            </button>
            <button type="button" className="btn-outline px-4 py-2 text-sm" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
