// src/lib/paper-form-scan.ts
//
// PAPER SCAN → CANDIDATE LINES for the staff Order Builder.
//
// A cook marks QNTY cells on Sinclair's ruled form, scans ~20 pages, and emails
// them. This module turns those pages into reviewable candidates:
//   1. render PDF/image pages to canvas (client-side — Vercel has a 30s limit)
//   2. find inked cells in the right-hand QNTY column
//   3. map each row slot to the paper-form layout (form_seq order)
//   4. match layout rows to the live catalogue (UPC / desc+pkg / desc)
//   5. optional OCR to PREFILL qty only — never silent-commit
//
// NOTHING HERE POSTS AN ORDER. The builder still owns qty state and submits
// through public POST /api/orders.

import type { FormLayoutItem } from '@/lib/form-layout-apply';

export interface CatalogItem {
  id: string;
  upc: string | null;
  description: string;
  pkg_size: string | null;
  form_seq: number | null;
  price: number;
  uom: string | null;
  billed_by_weight?: boolean;
  quantity_step?: number | null;
}

export type MatchHow = 'upc' | 'desc+pkg' | 'desc' | 'form_seq' | 'unmatched';

export interface ScanCandidate {
  /** Index into the flattened paper-form layout. */
  layoutSeq: number;
  layout: FormLayoutItem;
  pageIndex: number;
  rowIndexOnPage: number;
  /** Data-URL crop of the QNTY handwriting cell (for the review UI). */
  cropDataUrl: string;
  /** Ink density 0..1 in the QNTY cell. */
  ink: number;
  match: CatalogItem | null;
  matchHow: MatchHow;
  /** When form_seq points at a different product than UPC/desc match. */
  disagreement: string | null;
  /** OCR / heuristic qty suggestion — review UI may edit or clear. */
  suggestedQty: number | null;
  /** Non-numeric mark text (Cream, Cs, …) → notes, not qty. */
  markNote: string | null;
  ocrText: string | null;
}

export interface ScanProgress {
  phase: 'render' | 'detect' | 'ocr' | 'done';
  page: number;
  pages: number;
  message: string;
}

const digits = (s: string) => (s || '').replace(/\D+/g, '');
export const upcKey = (s: string | null | undefined) => digits(s || '').replace(/^0+/, '');
const normDesc = (d: string | null | undefined) =>
  (d || '').toUpperCase().replace(/[^A-Z0-9%#~\/.]+/g, ' ').trim().replace(/\s+/g, ' ');
const normPkg = (p: string | null | undefined) =>
  (p || '').toUpperCase().replace(/\s+/g, '').replace(/POUND|LBS?\.?/g, '#');

/** Match one layout row to the catalogue — same confidence order as form-layout-apply. */
export function matchLayoutToCatalog(
  layout: FormLayoutItem,
  catalog: CatalogItem[],
  byUpc: Map<string, CatalogItem>,
  byDescPkg: Map<string, CatalogItem[]>,
  byDesc: Map<string, CatalogItem[]>,
  bySeq: Map<number, CatalogItem>,
): { match: CatalogItem | null; how: MatchHow; disagreement: string | null } {
  let match: CatalogItem | null = null;
  let how: MatchHow = 'unmatched';

  if (layout.upc) {
    const hit = byUpc.get(upcKey(layout.upc));
    if (hit) { match = hit; how = 'upc'; }
  }
  if (!match) {
    const key = normDesc(layout.description) + '|' + normPkg(layout.pkg_size);
    const hits = byDescPkg.get(key);
    if (hits?.length === 1) { match = hits[0]; how = 'desc+pkg'; }
  }
  if (!match) {
    const hits = byDesc.get(normDesc(layout.description));
    if (hits?.length === 1) { match = hits[0]; how = 'desc'; }
  }

  const seqHit = bySeq.get(layout.seq) || null;
  let disagreement: string | null = null;
  if (match && seqHit && seqHit.id !== match.id) {
    disagreement = `form_seq #${layout.seq} is “${seqHit.description}” in the catalogue, but UPC/name matched “${match.description}”.`;
  }
  if (!match && seqHit) {
    match = seqHit;
    how = 'form_seq';
  }

  return { match, how, disagreement };
}

export function buildCatalogIndexes(catalog: CatalogItem[]) {
  const byUpc = new Map<string, CatalogItem>();
  const byDescPkg = new Map<string, CatalogItem[]>();
  const byDesc = new Map<string, CatalogItem[]>();
  const bySeq = new Map<number, CatalogItem>();
  for (const it of catalog) {
    const k = upcKey(it.upc);
    if (k && !byUpc.has(k)) byUpc.set(k, it);
    const dk = normDesc(it.description) + '|' + normPkg(it.pkg_size);
    const arr = byDescPkg.get(dk) || [];
    arr.push(it); byDescPkg.set(dk, arr);
    const d = normDesc(it.description);
    const darr = byDesc.get(d) || [];
    darr.push(it); byDesc.set(d, darr);
    if (it.form_seq != null && !bySeq.has(it.form_seq)) bySeq.set(it.form_seq, it);
  }
  return { byUpc, byDescPkg, byDesc, bySeq };
}

/** Render a PDF File to one canvas per page (client only). */
export async function renderPdfToCanvases(
  file: File,
  onPage?: (page: number, pages: number) => void,
): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import('pdfjs-dist');
  // Worker from the same package version — CDN keeps the Next bundle lean.
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const out: HTMLCanvasElement[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onPage?.(i, doc.numPages);
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    await (page.render({ canvasContext: ctx, viewport } as Parameters<typeof page.render>[0])).promise;
    out.push(canvas);
  }
  return out;
}

export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    throw new Error('Use renderPdfToCanvases for PDFs');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read that image'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface RowBand {
  y0: number;
  y1: number;
}

/**
 * Find horizontal rule lines, then treat gaps between them as row bands.
 * Falls back to a fixed row pitch when the scan is too light to show rules.
 */
function findRowBands(canvas: HTMLCanvasElement): RowBand[] {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, w, h);

  const darknessAt = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return 1 - (data[i] + data[i + 1] + data[i + 2]) / (3 * 255);
  };

  // Content margins — skip letterhead / footer noise.
  const yStart = Math.floor(h * 0.10);
  const yEnd = Math.floor(h * 0.96);
  const xLeft = Math.floor(w * 0.08);
  const xRight = Math.floor(w * 0.92);

  const lineScore: number[] = new Array(h).fill(0);
  for (let y = yStart; y < yEnd; y++) {
    let dark = 0;
    let samples = 0;
    for (let x = xLeft; x < xRight; x += 3) {
      samples++;
      if (darknessAt(x, y) > 0.45) dark++;
    }
    lineScore[y] = dark / Math.max(1, samples);
  }

  // Peak-pick horizontal rules.
  const rules: number[] = [];
  const threshold = 0.22;
  for (let y = yStart + 2; y < yEnd - 2; y++) {
    if (lineScore[y] >= threshold && lineScore[y] >= lineScore[y - 1] && lineScore[y] >= lineScore[y + 1]) {
      if (!rules.length || y - rules[rules.length - 1] > 8) rules.push(y);
    }
  }

  const bands: RowBand[] = [];
  if (rules.length >= 8) {
    for (let i = 0; i < rules.length - 1; i++) {
      const y0 = rules[i] + 1;
      const y1 = rules[i + 1] - 1;
      if (y1 - y0 >= 10 && y1 - y0 <= Math.floor(h * 0.08)) bands.push({ y0, y1 });
    }
  }

  // Fallback: uniform pitch under the header.
  if (bands.length < 10) {
    bands.length = 0;
    const top = Math.floor(h * 0.14);
    const bottom = Math.floor(h * 0.95);
    const rows = 48;
    const pitch = (bottom - top) / rows;
    for (let i = 0; i < rows; i++) {
      bands.push({ y0: Math.floor(top + i * pitch), y1: Math.floor(top + (i + 1) * pitch) - 1 });
    }
  }

  return bands;
}

function qntyRect(canvas: HTMLCanvasElement, band: RowBand) {
  const w = canvas.width;
  // QNTY is the rightmost narrow column on Sinclair's form.
  const x0 = Math.floor(w * 0.86);
  const x1 = Math.floor(w * 0.97);
  return { x0, y0: band.y0, x1, y1: band.y1 };
}

function measureInk(canvas: HTMLCanvasElement, r: { x0: number; y0: number; x1: number; y1: number }): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const w = Math.max(1, r.x1 - r.x0);
  const h = Math.max(1, r.y1 - r.y0);
  const { data } = ctx.getImageData(r.x0, r.y0, w, h);
  let ink = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    n++;
    if (lum < 140) ink++; // pencil/pen on white-ish paper
  }
  return ink / Math.max(1, n);
}

function cropDataUrl(canvas: HTMLCanvasElement, r: { x0: number; y0: number; x1: number; y1: number }): string {
  const w = Math.max(1, r.x1 - r.x0);
  const h = Math.max(1, r.y1 - r.y0);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(canvas, r.x0, r.y0, w, h, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.85);
}

/** Detect inked QNTY rows on one page canvas. */
export function detectInkedRowsOnPage(canvas: HTMLCanvasElement, inkThreshold = 0.045) {
  const bands = findRowBands(canvas);
  const marked: Array<{ rowIndex: number; ink: number; cropDataUrl: string; rect: ReturnType<typeof qntyRect> }> = [];
  for (let i = 0; i < bands.length; i++) {
    const rect = qntyRect(canvas, bands[i]);
    const ink = measureInk(canvas, rect);
    if (ink >= inkThreshold) {
      marked.push({ rowIndex: i, ink, cropDataUrl: cropDataUrl(canvas, rect), rect });
    }
  }
  return { bands, marked };
}

/**
 * Parse OCR text into a qty or a note.
 * Numbers → suggestedQty. Words like Cream / Cs / sub → markNote.
 */
export function interpretMark(text: string | null): { qty: number | null; note: string | null } {
  if (!text) return { qty: null, note: null };
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return { qty: null, note: null };
  const num = t.match(/(\d+(?:\.\d+)?)/);
  if (num && /^[\d.\s/]+$/.test(t.replace(/[x×]/gi, ''))) {
    const q = Number(num[1]);
    if (q > 0 && q < 1000) return { qty: q, note: null };
  }
  // Has letters → treat as a note / substitution cue, not a silent qty.
  if (/[a-zA-Z]/.test(t)) return { qty: null, note: t.slice(0, 80) };
  if (num) {
    const q = Number(num[1]);
    if (q > 0 && q < 1000) return { qty: q, note: null };
  }
  return { qty: null, note: t.slice(0, 80) };
}

async function ocrCrop(dataUrl: string): Promise<string | null> {
  try {
    const Tesseract = await import('tesseract.js');
    const result = await Tesseract.recognize(dataUrl, 'eng', {
      logger: () => {},
    });
    return (result.data.text || '').trim() || null;
  } catch {
    return null;
  }
}

/**
 * Full pipeline: pages → candidates ready for the review UI.
 *
 * Row slots are walked in page order and mapped onto layout items in form_seq
 * order (the paper form's own order). Only inked QNTY cells become candidates.
 */
export async function scanPaperPages(opts: {
  canvases: HTMLCanvasElement[];
  layoutItems: FormLayoutItem[];
  catalog: CatalogItem[];
  runOcr?: boolean;
  onProgress?: (p: ScanProgress) => void;
}): Promise<ScanCandidate[]> {
  const { canvases, layoutItems, catalog, runOcr = true, onProgress } = opts;
  const indexes = buildCatalogIndexes(catalog);
  const candidates: ScanCandidate[] = [];

  // Flatten row slots across pages; each slot consumes the next layout row.
  let layoutCursor = 0;

  for (let p = 0; p < canvases.length; p++) {
    onProgress?.({ phase: 'detect', page: p + 1, pages: canvases.length, message: `Reading page ${p + 1}…` });
    const { bands, marked } = detectInkedRowsOnPage(canvases[p]);
    const markedByRow = new Map(marked.map(m => [m.rowIndex, m]));

    for (let r = 0; r < bands.length; r++) {
      if (layoutCursor >= layoutItems.length) break;
      const layout = layoutItems[layoutCursor];
      layoutCursor++;
      const hit = markedByRow.get(r);
      if (!hit) continue;

      const { match, how, disagreement } = matchLayoutToCatalog(
        layout, catalog, indexes.byUpc, indexes.byDescPkg, indexes.byDesc, indexes.bySeq,
      );

      let ocrText: string | null = null;
      if (runOcr) {
        onProgress?.({ phase: 'ocr', page: p + 1, pages: canvases.length, message: `Reading quantity on page ${p + 1}…` });
        ocrText = await ocrCrop(hit.cropDataUrl);
      }
      const { qty, note } = interpretMark(ocrText);

      candidates.push({
        layoutSeq: layout.seq,
        layout,
        pageIndex: p,
        rowIndexOnPage: r,
        cropDataUrl: hit.cropDataUrl,
        ink: hit.ink,
        match,
        matchHow: how,
        disagreement,
        suggestedQty: qty,
        markNote: note,
        ocrText,
      });
    }
  }

  onProgress?.({ phase: 'done', page: canvases.length, pages: canvases.length, message: 'Ready for review' });
  return candidates;
}
