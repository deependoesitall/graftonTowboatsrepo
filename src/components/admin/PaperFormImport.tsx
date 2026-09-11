'use client';
// src/components/admin/PaperFormImport.tsx
//
// Calm upload → auto-orient → review. Uncertainty is always visible.
// Human confirms every quantity. Write-ins / COD from the last page are shown.

import { useCallback, useMemo, useState } from 'react';
import {
  Camera, FileUp, Loader2, Check, X, AlertTriangle, Trash2, RotateCcw,
} from 'lucide-react';
import layoutJson from '@/data/order-form-layout.json';
import type { FormLayoutItem } from '@/lib/form-layout-apply';
import {
  type CatalogItem,
  type ScanCandidate,
  type WriteInCandidate,
  type ScanProgress,
  fileToCanvas,
  renderPdfToCanvases,
  scanPaperPages,
} from '@/lib/paper-form-scan';

const layoutItems = (layoutJson as { items: FormLayoutItem[] }).items;

export interface ApplyLine {
  productId: string;
  qty: number;
  paid_by?: 'vessel' | 'cod';
  cod_name?: string;
}

export interface PaperFormImportProps {
  catalog: CatalogItem[];
  setLine: (productId: string, qty: number) => void;
  /** Optional COD-aware apply (preferred). */
  applyLines?: (lines: ApplyLine[]) => void;
  appendNotes?: (note: string) => void;
  onApplied?: (count: number) => void;
}

type FormReview = ScanCandidate & { qtyInput: string; include: boolean; noteInput: string };
type WriteReview = WriteInCandidate & { qtyInput: string; include: boolean; noteInput: string };

function flagTone(confidence: string, flags: string[]) {
  if (confidence === 'needs_review' || flags.length) return 'border-amber-200 bg-amber-50/40';
  if (confidence === 'low' || confidence === 'medium') return 'border-amber-100 bg-white';
  return 'border-gray-100 bg-white';
}

export function PaperFormImport({ catalog, setLine, applyLines, appendNotes, onApplied }: PaperFormImportProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState('');
  const [formRows, setFormRows] = useState<FormReview[] | null>(null);
  const [writeRows, setWriteRows] = useState<WriteReview[] | null>(null);
  const [summaryFlags, setSummaryFlags] = useState<string[]>([]);
  const [runOcr, setRunOcr] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setFormRows(null); setWriteRows(null); setError(''); setProgress(null); setSummaryFlags([]);
  };

  const needsHuman = useMemo(() => {
    const f = (formRows || []).filter(r => r.confidence === 'needs_review' || !r.match || r.flags.length).length;
    const w = (writeRows || []).filter(r => r.confidence === 'needs_review' || !r.match || r.flags.length).length;
    return f + w;
  }, [formRows, writeRows]);

  const processFiles = useCallback(async (list: FileList | File[] | null) => {
    if (!list || !list.length) return;
    setBusy(true);
    setError('');
    setFormRows(null);
    setWriteRows(null);
    setSummaryFlags([]);
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
          throw new Error(`Unsupported file: ${f.name}. Use a PDF or photos.`);
        }
      }
      if (!canvases.length) throw new Error('No pages to read.');

      const result = await scanPaperPages({
        canvases,
        layoutItems,
        catalog,
        runOcr,
        onProgress: setProgress,
      });

      if (!result.candidates.length && !result.writeIns.length) {
        setError('No marked quantities or write-ins found. Try a sharper scan, or enter the form by hand.');
        return;
      }

      setSummaryFlags(result.summaryFlags);
      setFormRows(result.candidates.map(c => ({
        ...c,
        include: !!c.match && c.suggestedQty != null,
        qtyInput: c.suggestedQty != null ? String(c.suggestedQty) : '',
        noteInput: c.markNote || '',
      })));
      setWriteRows(result.writeIns.map(w => ({
        ...w,
        include: !!w.match && w.suggestedQty != null,
        qtyInput: w.suggestedQty != null ? String(w.suggestedQty) : '',
        noteInput: w.isCod ? (w.codName ? `COD ${w.codName}` : 'COD') : '',
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that scan.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [catalog, runOcr]);

  function commit() {
    if (!formRows && !writeRows) return;
    const lines: ApplyLine[] = [];
    const notes: string[] = [];

    for (const r of formRows || []) {
      if (!r.include || !r.match) {
        if (!r.include && r.match && r.noteInput.trim()) {
          notes.push(`${r.match.description}: ${r.noteInput.trim()}`);
        }
        continue;
      }
      const qty = Number(r.qtyInput);
      if (!qty || qty <= 0) {
        if (r.noteInput.trim()) notes.push(`${r.match.description}: ${r.noteInput.trim()}`);
        continue;
      }
      lines.push({ productId: r.match.id, qty });
      if (r.noteInput.trim()) notes.push(`${r.match.description}: ${r.noteInput.trim()}`);
    }

    for (const w of writeRows || []) {
      if (w.isCod && w.codName) notes.push(`COD contact: ${w.codName}`);
      else if (w.isCod) notes.push('COD noted on paper write-in area.');

      if (!w.include || !w.match) {
        if (w.rawText.trim()) notes.push(`Write-in: ${w.rawText.trim()}`);
        continue;
      }
      const qty = Number(w.qtyInput);
      if (!qty || qty <= 0) {
        notes.push(`Write-in: ${w.rawText.trim()}`);
        continue;
      }
      lines.push({
        productId: w.match.id,
        qty,
        paid_by: w.isCod ? 'cod' : 'vessel',
        cod_name: w.isCod ? (w.codName || undefined) : undefined,
      });
      if (w.noteInput.trim()) notes.push(`${w.match.description}: ${w.noteInput.trim()}`);
    }

    if (applyLines) applyLines(lines);
    else for (const l of lines) setLine(l.productId, l.qty);

    if (notes.length && appendNotes) appendNotes(notes.join('\n'));
    onApplied?.(lines.length);
    reset();
  }

  const included = useMemo(() => {
    const a = (formRows || []).filter(r => r.include && r.match && Number(r.qtyInput) > 0).length;
    const b = (writeRows || []).filter(r => r.include && r.match && Number(r.qtyInput) > 0).length;
    return a + b;
  }, [formRows, writeRows]);

  const reviewing = formRows || writeRows;

  return (
    <div className="card-base p-4 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-brand-navy">Scan the paper form</h2>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          Drop the marked Sinclair PDF or photos. Pages straighten themselves. You review every
          quantity — nothing is added until you say so. Write-ins and COD notes on the last page
          show up here too.
        </p>
      </div>

      {!reviewing && (
        <div className="space-y-3">
          <label
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              processFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 cursor-pointer transition-colors ${
              dragOver ? 'border-brand-green bg-brand-green/5' : 'border-gray-200 bg-gray-50 hover:border-brand-green/40 hover:bg-white'
            }`}
          >
            <div className="flex items-center gap-3 text-brand-navy">
              <FileUp className="w-5 h-5" />
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-brand-navy">Drop PDF or photos here</span>
            <span className="text-xs text-gray-400">Upside-down pages are fine — about 20 pages is fine</span>
            <input
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              disabled={busy}
              onChange={e => processFiles(e.target.files)}
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={runOcr}
              onChange={e => setRunOcr(e.target.checked)}
              className="rounded border-gray-300 text-brand-green focus:ring-brand-green"
            />
            Read handwriting (quantities + write-ins). Still needs your review.
          </label>
        </div>
      )}

      {busy && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-brand-green shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-brand-navy">{progress?.message || 'Working…'}</p>
            {progress && progress.pages > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">Page {progress.page} of {progress.pages}</p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {reviewing && (
        <div className="space-y-4">
          {summaryFlags.length > 0 && (
            <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 space-y-1">
              {summaryFlags.map((f, i) => (
                <p key={i} className="text-xs text-sky-900 flex gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {f}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              {(formRows?.length || 0)} marked form cell{(formRows?.length || 0) === 1 ? '' : 's'}
              {writeRows?.length ? ` · ${writeRows.length} write-in${writeRows.length === 1 ? '' : 's'}` : ''}
              {needsHuman ? ` · ${needsHuman} need a look` : ''}
            </p>
            <button type="button" onClick={reset} className="text-xs text-gray-500 hover:text-brand-navy flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> Start over
            </button>
          </div>

          {formRows && formRows.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Form rows</h3>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {formRows.map((r, idx) => (
                  <div key={`f-${r.layoutSeq}-${idx}`} className={`p-3 flex gap-3 border-l-4 ${flagTone(r.confidence, r.flags)} ${r.include ? '' : 'opacity-60'}`}
                    style={{ borderLeftColor: r.confidence === 'needs_review' || !r.match ? '#f59e0b' : r.confidence === 'high' ? '#16a34a' : '#fbbf24' }}>
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={e => {
                        const v = e.target.checked;
                        setFormRows(prev => prev!.map((x, i) => i === idx ? { ...x, include: v } : x));
                      }}
                      className="mt-2 rounded border-gray-300 text-brand-green focus:ring-brand-green"
                    />
                    <img src={r.cropDataUrl} alt="" className="w-16 h-10 object-contain rounded border border-gray-200 bg-white shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold text-brand-navy truncate">
                          {r.match?.description || r.layout.description}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-gray-400">
                          #{r.layoutSeq} · p{r.pageIndex + 1}
                          {r.orientationApplied ? ` · rotated ${r.orientationApplied}°` : ''}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 truncate">
                        {r.layout.pkg_size || '—'}
                        {r.layout.upc ? ` · UPC ${r.layout.upc}` : ' · no UPC'}
                        {` · ${r.matchHow}`}
                        {` · ${r.confidence}`}
                      </p>
                      {r.flags.map((f, i) => (
                        <p key={i} className="text-xs text-amber-800 flex gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {f}
                        </p>
                      ))}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <label className="text-xs text-gray-500 flex items-center gap-1.5">
                          Qty
                          <input
                            type="number" min={0} step="any" value={r.qtyInput}
                            onChange={e => {
                              const v = e.target.value;
                              setFormRows(prev => prev!.map((x, i) => i === idx ? { ...x, qtyInput: v, include: x.include || Number(v) > 0 } : x));
                            }}
                            className="input-base w-20 py-1 text-sm" placeholder="—"
                          />
                        </label>
                        <label className="text-xs text-gray-500 flex items-center gap-1.5 flex-1 min-w-[10rem]">
                          Note
                          <input
                            type="text" value={r.noteInput}
                            onChange={e => {
                              const v = e.target.value;
                              setFormRows(prev => prev!.map((x, i) => i === idx ? { ...x, noteInput: v } : x));
                            }}
                            className="input-base flex-1 py-1 text-sm" placeholder="Vegetarian, Cream, Cs…"
                          />
                        </label>
                      </div>
                    </div>
                    {r.match && Number(r.qtyInput) > 0 ? <Check className="w-4 h-4 text-green-600 shrink-0 mt-2" /> : <X className="w-4 h-4 text-amber-500 shrink-0 mt-2" />}
                  </div>
                ))}
              </div>
            </section>
          )}

          {writeRows && writeRows.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Write-ins &amp; COD (last page)</h3>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {writeRows.map((w, idx) => (
                  <div key={`w-${idx}`} className={`p-3 flex gap-3 border-l-4 ${flagTone(w.confidence, w.flags)}`}
                    style={{ borderLeftColor: w.isCod ? '#7c3aed' : (w.confidence === 'needs_review' || !w.match ? '#f59e0b' : '#16a34a') }}>
                    <input
                      type="checkbox"
                      checked={w.include}
                      onChange={e => {
                        const v = e.target.checked;
                        setWriteRows(prev => prev!.map((x, i) => i === idx ? { ...x, include: v } : x));
                      }}
                      className="mt-2 rounded border-gray-300 text-brand-green focus:ring-brand-green"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-semibold text-brand-navy">{w.description}</p>
                      <p className="text-xs text-gray-400 font-mono truncate">from “{w.rawText}”</p>
                      {w.isCod && (
                        <p className="text-xs font-bold text-purple-700">COD{w.codName ? ` · ${w.codName}` : ''}</p>
                      )}
                      {w.flags.map((f, i) => (
                        <p key={i} className="text-xs text-amber-800 flex gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {f}
                        </p>
                      ))}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <label className="text-xs text-gray-500 flex items-center gap-1.5">
                          Qty
                          <input
                            type="number" min={0} step="any" value={w.qtyInput}
                            onChange={e => {
                              const v = e.target.value;
                              setWriteRows(prev => prev!.map((x, i) => i === idx ? { ...x, qtyInput: v, include: !!x.match && (x.include || Number(v) > 0) } : x));
                            }}
                            className="input-base w-20 py-1 text-sm" placeholder="—"
                          />
                        </label>
                        <span className="text-xs text-gray-400 self-center">
                          {w.match ? `→ ${w.match.description}` : 'No catalogue match — stays in notes if unchecked'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
              disabled={included === 0 && !(writeRows || []).some(w => !w.include && w.rawText)}
              onClick={commit}
            >
              {included > 0 ? `Add ${included} line${included === 1 ? '' : 's'} to the order` : 'Save notes from write-ins'}
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
