'use client';
// src/components/admin/PaperFormImport.tsx
//
// Calm upload → auto-orient → review. Uncertainty is always visible.
// Human confirms every quantity. Write-ins / COD from the last page are shown.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, FileUp, Loader2, Check, X, AlertTriangle, Trash2, RotateCcw, ClipboardPaste,
} from 'lucide-react';
import layoutJson from '@/data/order-form-layout.json';
import type { FormLayoutItem } from '@/lib/form-layout-apply';
import {
  type CatalogItem,
  type ScanCandidate,
  type WriteInCandidate,
  type ScanProgress,
  type AnyCandidate,
  type MarkGroup,
  fileToCanvas,
  renderPdfToCanvases,
  scanPaperPages,
  needsHumanDecision,
} from '@/lib/paper-form-scan';
import { PaperFormQuantities, type QtyMark } from '@/components/admin/PaperFormQuantities';
import {
  PaperFormUnknowns,
  type Resolution,
  type UnknownRow,
} from '@/components/admin/PaperFormUnknowns';

const layoutItems = (layoutJson as { items: FormLayoutItem[] }).items;

export interface ApplyLine {
  productId: string;
  qty: number;
  paid_by?: 'vessel' | 'deck' | 'cod';
  cod_name?: string;
  /** Present for register-tape / full-store matches that are not on the paper form.
   *  Without these, applyLines writes qty against an id the sheet never renders
   *  and the draft stays at 0 lines. */
  description?: string;
  price?: number;
  category?: string;
  pkg_size?: string | null;
  uom?: string | null;
  image_url?: string | null;
  upc?: string | null;
}

/**
 * A line with no catalog row behind it — a write-in for something Sinclair's
 * stocks but never printed on the form. It reaches the order through the SAME
 * builder draft and the same POST /api/orders as everything else; the only
 * difference on the wire is an empty product_id, which that route already
 * treats as "no catalog row" for its service lines.
 */
export interface CustomLine {
  description: string;
  qty: number;
  price: number;
  paid_by?: 'vessel' | 'cod';
  cod_name?: string;
}

export interface PaperFormImportProps {
  catalog: CatalogItem[];
  setLine: (productId: string, qty: number) => void;
  /** Optional COD-aware apply (preferred). */
  applyLines?: (lines: ApplyLine[]) => void;
  appendNotes?: (note: string) => void;
  /** Off-catalog lines resolved from unreadable marks. */
  addCustomLines?: (lines: CustomLine[]) => void;
  onApplied?: (count: number) => void;
}

type FormReview = ScanCandidate & { qtyInput: string; include: boolean; noteInput: string; resolution: Resolution };
type WriteReview = WriteInCandidate & { qtyInput: string; include: boolean; noteInput: string; resolution: Resolution };

function flagTone(confidence: string, flags: string[]) {
  if (confidence === 'needs_review' || flags.length) return 'border-amber-200 bg-amber-50/40';
  if (confidence === 'low' || confidence === 'medium') return 'border-amber-100 bg-white';
  return 'border-gray-100 bg-white';
}

export function PaperFormImport({ catalog, setLine, applyLines, appendNotes, addCustomLines, onApplied }: PaperFormImportProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState('');
  const [formRows, setFormRows] = useState<FormReview[] | null>(null);
  const [writeRows, setWriteRows] = useState<WriteReview[] | null>(null);
  const [summaryFlags, setSummaryFlags] = useState<string[]>([]);
  const [markGroups, setMarkGroups] = useState<MarkGroup[]>([]);
  const [runOcr, setRunOcr] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setFormRows(null); setWriteRows(null); setError(''); setProgress(null); setSummaryFlags([]);
    setMarkGroups([]);
  };

  /**
   * ⚠️ ONE TEST, NOT THREE. This used to re-derive "needs a look" inline, which
   * is how a row ends up counted as uncertain in the header and rendered as
   * confirmed in the list. needsHumanDecision() in paper-form-scan.ts is now the
   * only place that decides, and the panel below reads the same function.
   */
  const flaggedForm = useMemo(
    () => (formRows || []).map((r, idx) => ({ r, idx })).filter(x => needsHumanDecision(x.r as AnyCandidate)),
    [formRows],
  );
  const flaggedWrite = useMemo(
    () => (writeRows || []).map((r, idx) => ({ r, idx })).filter(x => needsHumanDecision(x.r as AnyCandidate)),
    [writeRows],
  );

  /** Flagged rows leave the main list entirely — they live in the panel. */
  const flaggedFormIdx = useMemo(() => new Set(flaggedForm.map(x => x.idx)), [flaggedForm]);
  const flaggedWriteIdx = useMemo(() => new Set(flaggedWrite.map(x => x.idx)), [flaggedWrite]);

  const unknownRows: UnknownRow[] = useMemo(() => [
    ...flaggedForm.map(x => ({ key: `f${x.idx}`, candidate: x.r as AnyCandidate, resolution: x.r.resolution })),
    ...flaggedWrite.map(x => ({ key: `w${x.idx}`, candidate: x.r as AnyCandidate, resolution: x.r.resolution })),
  ], [flaggedForm, flaggedWrite]);

  const needsHuman = useMemo(
    () => unknownRows.filter(u => u.resolution.kind === 'pending').length,
    [unknownRows],
  );

  /**
   * THE MARKS THAT JUST NEED A NUMBER.
   *
   * Everything the scanner could place on the form and match to a product — so
   * the only open question is what the pencil says. These go to the keypad
   * step; anything with a real problem behind it (no catalog match, a
   * disagreement between UPC and description, a write-in) stays in the panel
   * below where there is room to explain.
   */
  const qtyMarks: QtyMark[] = useMemo(
    () => (formRows || [])
      .map((r, idx) => ({ r, idx }))
      .filter(({ r, idx }) => !flaggedFormIdx.has(idx) && !!r.match)
      .map(({ r, idx }) => ({
        key: `f${idx}`,
        index: idx,
        imageUrl: r.markImageDataUrl,
        contextUrl: r.contextCropDataUrl,
        description: r.match?.description || r.layout.description,
        page: r.pageIndex + 1,
        qty: r.qtyInput,
        note: r.noteInput,
      })),
    [formRows, flaggedFormIdx],
  );

  const markShapes = useMemo(() => (formRows || []).map(r => r.shape), [formRows]);

  const setQty = useCallback((keys: string[], qty: string) => {
    const want = new Set(keys.map(k => Number(k.slice(1))));
    setFormRows(prev => prev
      ? prev.map((x, i) => want.has(i) ? { ...x, qtyInput: qty, include: Number(qty) > 0 } : x)
      : prev);
  }, []);

  const setMarkNote = useCallback((key: string, text: string) => {
    const idx = Number(key.slice(1));
    setFormRows(prev => prev ? prev.map((x, i) => i === idx ? { ...x, noteInput: text } : x) : prev);
  }, []);

  const resolve = useCallback((key: string, res: Resolution) => {
    const idx = Number(key.slice(1));
    if (key.startsWith('f')) {
      setFormRows(prev => prev ? prev.map((x, i) => i === idx ? { ...x, resolution: res } : x) : prev);
    } else {
      setWriteRows(prev => prev ? prev.map((x, i) => i === idx ? { ...x, resolution: res } : x) : prev);
    }
  }, []);

  const processFiles = useCallback(async (list: FileList | File[] | null) => {
    if (!list || !list.length) return;
    setBusy(true);
    setError('');
    setFormRows(null);
    setWriteRows(null);
    setSummaryFlags([]);
    setMarkGroups([]);
    try {
      const files = Array.from(list);
      const canvases: HTMLCanvasElement[] = [];
      // Tracked per page, not per upload: someone can drop the PDF and two
      // phone shots of the write-in page in the same go, and only the shots
      // need flattening.
      const isPhoto: boolean[] = [];
      for (const f of files) {
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          setProgress({ phase: 'render', page: 0, pages: 0, message: `Opening ${f.name}…` });
          const pages = await renderPdfToCanvases(f, (page, pages) => {
            setProgress({ phase: 'render', page, pages, message: `Reading page ${page} of ${pages}…` });
          });
          canvases.push(...pages);
          for (let i = 0; i < pages.length; i++) isPhoto.push(false);
        } else if (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(f.name)) {
          setProgress({ phase: 'render', page: canvases.length + 1, pages: files.length, message: `Opening ${f.name}…` });
          canvases.push(await fileToCanvas(f));
          isPhoto.push(true);
        } else {
          throw new Error(`Unsupported file: ${f.name}. Use a PDF or photos.`);
        }
      }
      if (!canvases.length) throw new Error('No pages to read.');

      const result = await scanPaperPages({
        canvases,
        isPhoto,
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
      setMarkGroups(result.markGroups);
      setFormRows(result.candidates.map(c => ({
        ...c,
        include: !!c.match && c.suggestedQty != null,
        qtyInput: c.suggestedQty != null ? String(c.suggestedQty) : '',
        noteInput: c.markNote || '',
        resolution: { kind: 'pending' } as Resolution,
      })));
      setWriteRows(result.writeIns.map(w => ({
        ...w,
        include: !!w.match && w.suggestedQty != null,
        qtyInput: w.suggestedQty != null ? String(w.suggestedQty) : '',
        noteInput: w.isCod ? (w.codName ? `COD ${w.codName}` : 'COD') : '',
        resolution: { kind: 'pending' } as Resolution,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that scan.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [catalog, runOcr]);

  /**
   * PASTE A PDF OR A PHOTO.
   *
   * On an iPhone the scan usually arrives as an attachment in Mail or a file in
   * Files, and the shortest route from there is Copy → Paste. Making people
   * save it to Files first, then find it again through a file picker, is three
   * extra steps at the exact moment someone is standing in an office trying to
   * get an order in.
   *
   * ⚠️ TWO PATHS, BECAUSE ONE IS NOT ENOUGH ON iOS.
   *
   *   1. The `paste` EVENT carries `clipboardData.files` and is what fires on a
   *      desktop and on iOS when the paste lands in an editable element. That
   *      is why the drop zone below is focusable and contentEditable — on iOS
   *      the Paste item in the callout menu only appears over something that
   *      accepts input, so without it there is nothing to paste INTO.
   *
   *   2. The Paste BUTTON reads the clipboard directly. Safari requires the
   *      read to happen inside a user gesture, which a button click is; this is
   *      the path for someone who taps the button rather than long-pressing.
   *
   * Either way the files go through the same processFiles() as the picker and
   * the drop zone — there is no second import path to keep in step.
   */
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  const [pasteHint, setPasteHint] = useState('');

  const acceptPasted = useCallback((files: File[]) => {
    const usable = files.filter(f =>
      f.type === 'application/pdf' || /\.pdf$/i.test(f.name) || f.type.startsWith('image/'));
    if (!usable.length) {
      // Naming what WAS on the clipboard beats "nothing found" — usually it is
      // a link to the file rather than the file itself.
      setPasteHint(files.length
        ? 'That clipboard item is not a PDF or an image. Copy the file itself, not a link to it.'
        : 'Nothing on the clipboard yet. Copy the PDF or the photo first.');
      return;
    }
    setPasteHint('');
    const mb = usable.reduce((n, f) => n + f.size, 0) / (1024 * 1024);
    if (mb > 6) {
      // A big scan is normal — the Scott Noble order is 11 MB — but the first
      // thirty seconds are silent while pdf.js opens it, and silence reads as
      // broken.
      setPasteHint(`Opening a ${mb.toFixed(0)} MB file — the first page can take a moment on a phone.`);
    }
    processFiles(usable);
  }, [processFiles]);

  useEffect(() => {
    if (busy || formRows || writeRows) return;
    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt) return;
      const files = Array.from(dt.files || []);
      if (!files.length) return;
      // Only swallow the event when we actually took something, so pasting
      // text into a field on this page still behaves normally.
      e.preventDefault();
      acceptPasted(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [busy, formRows, writeRows, acceptPasted]);

  const pasteFromClipboard = useCallback(async () => {
    setPasteHint('');
    // ⚠️ SAY SOMETHING BEFORE THE WAIT, NOT AFTER IT.
    //
    // Pulling an 11 MB PDF off the clipboard takes several seconds on a phone
    // and this function showed nothing at all until it was finished, so the
    // button looked dead and people pressed it again — starting a second read
    // alongside the first, on a device already short of memory.
    setBusy(true);
    setProgress({ phase: 'render', page: 0, pages: 0, message: 'Reading from the clipboard…' });
    try {
      const nav = navigator as Navigator & { clipboard?: { read?: () => Promise<ClipboardItem[]> } };
      if (!nav.clipboard?.read) {
        setPasteHint('This browser can’t read the clipboard directly — tap the box above and use Paste.');
        return;
      }
      const items = await nav.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type === 'application/pdf' || type.startsWith('image/')) {
            const blob = await item.getType(type);
            const ext = type === 'application/pdf' ? 'pdf' : (type.split('/')[1] || 'png');
            files.push(new File([blob], `pasted-${Date.now()}.${ext}`, { type }));
            break;
          }
        }
      }
      setBusy(false);
      setProgress(null);
      acceptPasted(files);
    } catch {
      setBusy(false);
      setProgress(null);
      // A denied permission and an empty clipboard look the same from here, so
      // the message covers both rather than guessing wrong.
      setPasteHint('Couldn’t read the clipboard. Tap the box above, then choose Paste.');
    }
  }, [acceptPasted]);

  function commit() {
    if (!formRows && !writeRows) return;
    const lines: ApplyLine[] = [];
    const customs: CustomLine[] = [];
    const notes: string[] = [];

    /**
     * RESOLVED MARKS FIRST, AND THEY OWN THEIR ROW.
     *
     * A row that someone answered in the panel must not ALSO go through the
     * ordinary include/qty path below, or a mark resolved as "2 × chicken
     * thighs" would be added twice — once from the answer and once from the
     * half-read OCR guess that made it uncertain in the first place. Every
     * flagged row is skipped further down; this is the only thing that speaks
     * for it.
     */
    const answered = (row: { resolution: Resolution }, label: string): boolean => {
      const res = row.resolution;
      if (res.kind === 'pending') return false;
      if (res.kind === 'skip') return true;
      if (res.kind === 'catalog') {
        if (res.qty > 0) lines.push({ productId: res.product.id, qty: res.qty });
        return true;
      }
      if (res.kind === 'custom') {
        if (res.qty > 0) customs.push({ description: res.description, qty: res.qty, price: res.price });
        return true;
      }
      notes.push(label ? `${label}: ${res.text}` : res.text);
      return true;
    };

    for (const [idx, r] of (formRows || []).entries()) {
      if (flaggedFormIdx.has(idx)) {
        // Unresolved flagged rows are deliberately dropped, not guessed at.
        answered(r, r.match?.description || r.layout?.description || '');
        continue;
      }
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

    for (const [idx, w] of (writeRows || []).entries()) {
      if (flaggedWriteIdx.has(idx)) {
        if (w.isCod && w.codName) notes.push(`COD contact: ${w.codName}`);
        answered(w, w.description || 'Write-in');
        continue;
      }
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

    if (customs.length) {
      if (addCustomLines) addCustomLines(customs);
      else {
        // No custom-line channel on this host — never lose the information.
        // It becomes a note rather than vanishing between two screens.
        notes.push(...customs.map(c => `Off-catalog: ${c.qty} × ${c.description}`));
      }
    }

    if (notes.length && appendNotes) appendNotes(notes.join('\n'));
    onApplied?.(lines.length + customs.length);
    reset();
  }

  const included = useMemo(() => {
    const a = (formRows || []).filter((r, i) => !flaggedFormIdx.has(i) && r.include && r.match && Number(r.qtyInput) > 0).length;
    const b = (writeRows || []).filter((r, i) => !flaggedWriteIdx.has(i) && r.include && r.match && Number(r.qtyInput) > 0).length;
    const c = unknownRows.filter(u => u.resolution.kind === 'catalog' || u.resolution.kind === 'custom').length;
    return a + b + c;
  }, [formRows, writeRows, flaggedFormIdx, flaggedWriteIdx, unknownRows]);

  const reviewing = formRows || writeRows;

  return (
    <div className="card-base p-4 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-brand-navy">Scan the paper form</h2>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          Drop the marked Sinclair PDF or photos. Pages straighten themselves, the marks are cut out
          and sorted so identical handwriting is answered once, and you tap the number. Nothing is
          added until you say so. Write-ins and COD notes on the last page show up here too.
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
            <span className="text-sm font-semibold text-brand-navy">
              Drop, paste or choose a PDF or photos
            </span>
            <span className="text-xs text-gray-400">Upside-down pages are fine — send the whole order form</span>
            <input
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              disabled={busy}
              onChange={e => processFiles(e.target.files)}
            />
          </label>

          {/* THE PASTE TARGET.
              contentEditable and focusable on purpose: iOS only offers Paste in
              the long-press callout over something that accepts input, so
              without a target there is literally nowhere on the page to paste a
              copied PDF. suppressContentEditableWarning because React is right
              that editable nodes it doesn't own are usually a mistake — here it
              is the whole point, and nothing is ever read out of it. */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div
              ref={pasteZoneRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              tabIndex={0}
              aria-label="Paste a copied PDF or photo here"
              spellCheck={false}
              onInput={e => { (e.currentTarget as HTMLDivElement).textContent = ''; }}
              className="flex-1 min-h-[44px] rounded-lg border border-dashed border-gray-300 bg-white
                         px-3 py-2.5 text-xs text-gray-400 outline-none focus:border-brand-green
                         focus:ring-1 focus:ring-brand-green/30 cursor-text"
            >
              Copied it on your phone? Tap here, then Paste.
            </div>
            <button
              type="button"
              onClick={pasteFromClipboard}
              disabled={busy}
              className="btn-outline text-xs px-3 py-2 flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50">
              <ClipboardPaste className="w-3.5 h-3.5" /> Paste from clipboard
            </button>
          </div>

          {pasteHint && (
            <p className="text-xs text-amber-700 leading-relaxed">{pasteHint}</p>
          )}

          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={runOcr}
              onChange={e => setRunOcr(e.target.checked)}
              className="rounded border-gray-300 text-brand-green focus:ring-brand-green"
            />
            Read the write-in block at the bottom of the last pages. Quantities are always yours to confirm.
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

          {/* THE FLAGGED MARKS, ABOVE EVERYTHING, WITH THEIR OWN TREATMENT.
              Not a warmer border on a row in a list of ninety — its own panel,
              because a list is skimmed and skimming is what puts the wrong food
              on a boat. */}
          {qtyMarks.length > 0 && (
            <PaperFormQuantities
              marks={qtyMarks}
              shapes={markShapes}
              groups={markGroups}
              onSet={setQty}
              onNote={setMarkNote}
            />
          )}

          {unknownRows.length > 0 && (
            <PaperFormUnknowns rows={unknownRows} catalog={catalog} onResolve={resolve} />
          )}

          {formRows && formRows.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Form rows</h3>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {formRows.map((r, idx) => flaggedFormIdx.has(idx) ? null : (
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
                {writeRows.map((w, idx) => flaggedWriteIdx.has(idx) ? null : (
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
                          {w.match ? `→ ${w.match.description}` : 'No catalog match — stays in notes if unchecked'}
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
