// src/lib/paper-form-scan.ts
//
// PAPER SCAN → REVIEW CANDIDATES for the staff Order Builder.
//
// Client-side (Vercel 30s): render PDF/photos → auto-orient each page →
// detect inked QNTY cells → match to order-form layout / catalogue →
// OCR write-in blocks on the last page(s). Human always confirms qty.

import type { FormLayoutItem } from '@/lib/form-layout-apply';

export interface CatalogItem {
  id: string;
  upc: string | null;
  description: string;
  pkg_size: string | null;
  form_seq: number | null;
  price: number;
  uom: string | null;
  category?: string;
  billed_by_weight?: boolean;
  quantity_step?: number | null;
  image_url?: string | null;
}

export type MatchHow = 'upc' | 'desc+pkg' | 'desc' | 'form_seq' | 'unmatched';
export type Confidence = 'high' | 'medium' | 'low' | 'needs_review';

/** A rectangle on the ORIENTED page, in that page's own pixels. */
export interface CropRegion { x0: number; y0: number; x1: number; y1: number }

export interface ScanCandidate {
  kind: 'form_row';
  layoutSeq: number;
  layout: FormLayoutItem;
  pageIndex: number;
  rowIndexOnPage: number;
  cropDataUrl: string;
  ink: number;
  match: CatalogItem | null;
  matchHow: MatchHow;
  confidence: Confidence;
  flags: string[];
  disagreement: string | null;
  suggestedQty: number | null;
  markNote: string | null;
  ocrText: string | null;
  orientationApplied: 0 | 90 | 180 | 270;
  /**
   * THE WHOLE ROW, NOT JUST THE MARK.
   *
   * `cropDataUrl` above is the QNTY cell alone — right for confirming a digit,
   * useless for answering "what IS this". Someone looking at a mark reading
   * "Cs" needs the printed description sitting next to it on the same line, and
   * enough of the rows above and below to find the place on the paper in their
   * hand. This is that: full page width, the row plus a row of context either
   * side, with the QNTY cell outlined so the eye lands on it immediately.
   */
  contextCropDataUrl: string;
  /** Where `contextCropDataUrl` was taken from, for anyone who needs the page. */
  contextRegion: CropRegion;
  /** The QNTY cell itself, in the same page coordinates. */
  markRegion: CropRegion;
}

export interface WriteInCandidate {
  kind: 'write_in';
  pageIndex: number;
  rawText: string;
  description: string;
  suggestedQty: number | null;
  match: CatalogItem | null;
  matchHow: MatchHow;
  confidence: Confidence;
  flags: string[];
  /** When handwriting suggests COD / personal pay. */
  codName: string | null;
  isCod: boolean;
  cropDataUrl: string | null;
  /** Same idea as the form-row context crop: the write-in block, drawn large. */
  contextCropDataUrl: string | null;
  contextRegion: CropRegion | null;
}

export type AnyCandidate = ScanCandidate | WriteInCandidate;

export interface ScanProgress {
  phase: 'render' | 'orient' | 'detect' | 'ocr' | 'writeins' | 'done';
  page: number;
  pages: number;
  message: string;
}

export interface ScanResult {
  candidates: ScanCandidate[];
  writeIns: WriteInCandidate[];
  pageOrientations: Array<0 | 90 | 180 | 270>;
  summaryFlags: string[];
}

const digits = (s: string) => (s || '').replace(/\D+/g, '');
export const upcKey = (s: string | null | undefined) => digits(s || '').replace(/^0+/, '');
const normDesc = (d: string | null | undefined) =>
  (d || '').toUpperCase().replace(/[^A-Z0-9%#~\/.]+/g, ' ').trim().replace(/\s+/g, ' ');
const normPkg = (p: string | null | undefined) =>
  (p || '').toUpperCase().replace(/\s+/g, '').replace(/POUND|LBS?\.?/g, '#');

export function matchLayoutToCatalog(
  layout: FormLayoutItem,
  byUpc: Map<string, CatalogItem>,
  byDescPkg: Map<string, CatalogItem[]>,
  byDesc: Map<string, CatalogItem[]>,
  bySeq: Map<number, CatalogItem>,
): { match: CatalogItem | null; how: MatchHow; disagreement: string | null; confidence: Confidence; flags: string[] } {
  const flags: string[] = [];
  let match: CatalogItem | null = null;
  let how: MatchHow = 'unmatched';
  let confidence: Confidence = 'needs_review';

  if (layout.upc) {
    const hit = byUpc.get(upcKey(layout.upc));
    if (hit) { match = hit; how = 'upc'; confidence = 'high'; }
  }
  if (!match) {
    const key = normDesc(layout.description) + '|' + normPkg(layout.pkg_size);
    const hits = byDescPkg.get(key) || [];
    if (hits.length === 1) { match = hits[0]; how = 'desc+pkg'; confidence = 'high'; }
    else if (hits.length > 1) flags.push(`Several catalogue sizes match “${layout.description}”.`);
  }
  if (!match) {
    const hits = byDesc.get(normDesc(layout.description)) || [];
    if (hits.length === 1) { match = hits[0]; how = 'desc'; confidence = 'medium'; flags.push('Matched by name only — check pack size.'); }
    else if (hits.length > 1) flags.push(`Ambiguous name “${layout.description}” (${hits.length} hits).`);
  }

  const seqHit = bySeq.get(layout.seq) || null;
  let disagreement: string | null = null;
  if (match && seqHit && seqHit.id !== match.id) {
    disagreement = `form_seq #${layout.seq} is “${seqHit.description}” but UPC/name matched “${match.description}”.`;
    flags.push(disagreement);
    confidence = 'needs_review';
  }
  if (!match && seqHit) {
    match = seqHit;
    how = 'form_seq';
    confidence = 'medium';
    flags.push('Matched by form position only — confirm the product.');
  }
  if (!match) {
    flags.push('No catalogue match for this form row.');
    confidence = 'needs_review';
  }
  return { match, how, disagreement, confidence, flags };
}

export function matchWriteInToCatalog(
  description: string,
  catalog: CatalogItem[],
  byUpc: Map<string, CatalogItem>,
): { match: CatalogItem | null; how: MatchHow; confidence: Confidence; flags: string[] } {
  const flags: string[] = [];
  const d = digits(description);
  if (d.length >= 6) {
    const hit = byUpc.get(upcKey(d));
    if (hit) return { match: hit, how: 'upc', confidence: 'high', flags };
  }
  const q = normDesc(description);
  if (!q) return { match: null, how: 'unmatched', confidence: 'needs_review', flags: ['Empty write-in line.'] };

  const exact = catalog.filter(i => normDesc(i.description) === q);
  if (exact.length === 1) return { match: exact[0], how: 'desc', confidence: 'high', flags };

  const partial = catalog.filter(i => {
    const n = normDesc(i.description);
    return n.includes(q) || q.includes(n);
  });
  if (partial.length === 1) {
    flags.push('Fuzzy name match — confirm.');
    return { match: partial[0], how: 'desc', confidence: 'low', flags };
  }
  if (partial.length > 1) flags.push(`Write-in matched ${partial.length} products — pick one or keep as a note.`);
  else flags.push('Write-in not in catalogue — will go to order notes unless you match it.');
  return { match: null, how: 'unmatched', confidence: 'needs_review', flags };
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

function rotateCanvas(src: HTMLCanvasElement, deg: 0 | 90 | 180 | 270): HTMLCanvasElement {
  if (deg === 0) return src;
  const out = document.createElement('canvas');
  const rad = (deg * Math.PI) / 180;
  if (deg === 90 || deg === 270) {
    out.width = src.height;
    out.height = src.width;
  } else {
    out.width = src.width;
    out.height = src.height;
  }
  const ctx = out.getContext('2d')!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

/** Score how "form-like" a page looks (strong horizontal rules). Higher = better. */
function orientationScore(canvas: HTMLCanvasElement): number {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, w, h);
  const y0 = Math.floor(h * 0.12);
  const y1 = Math.floor(h * 0.9);
  const x0 = Math.floor(w * 0.1);
  const x1 = Math.floor(w * 0.9);
  let rules = 0;
  for (let y = y0; y < y1; y += 2) {
    let dark = 0;
    let n = 0;
    for (let x = x0; x < x1; x += 4) {
      const i = (y * w + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      n++;
      if (lum < 120) dark++;
    }
    if (n && dark / n > 0.28) rules++;
  }
  // Prefer landscape-ish line density typical of the form; penalize near-blank.
  return rules;
}

/** Pick 0/90/180/270 that maximizes horizontal rule evidence. */
export function autoOrientCanvas(canvas: HTMLCanvasElement): { canvas: HTMLCanvasElement; rotation: 0 | 90 | 180 | 270 } {
  const options: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  let best: 0 | 90 | 180 | 270 = 0;
  let bestScore = -1;
  for (const deg of options) {
    const c = rotateCanvas(canvas, deg);
    const s = orientationScore(c);
    if (s > bestScore) { bestScore = s; best = deg; }
  }
  return { canvas: rotateCanvas(canvas, best), rotation: best };
}

export async function renderPdfToCanvases(
  file: File,
  onPage?: (page: number, pages: number) => void,
): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import('pdfjs-dist');
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

interface RowBand { y0: number; y1: number }

function findRowBands(canvas: HTMLCanvasElement): RowBand[] {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, w, h);
  const darknessAt = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return 1 - (data[i] + data[i + 1] + data[i + 2]) / (3 * 255);
  };
  const yStart = Math.floor(h * 0.10);
  const yEnd = Math.floor(h * 0.96);
  const xLeft = Math.floor(w * 0.08);
  const xRight = Math.floor(w * 0.92);
  const lineScore: number[] = new Array(h).fill(0);
  for (let y = yStart; y < yEnd; y++) {
    let dark = 0; let samples = 0;
    for (let x = xLeft; x < xRight; x += 3) {
      samples++;
      if (darknessAt(x, y) > 0.45) dark++;
    }
    lineScore[y] = dark / Math.max(1, samples);
  }
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
  if (bands.length < 10) {
    bands.length = 0;
    const top = Math.floor(h * 0.14);
    const bottom = Math.floor(h * 0.88); // leave room for write-in block
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
  return { x0: Math.floor(w * 0.86), y0: band.y0, x1: Math.floor(w * 0.97), y1: band.y1 };
}

function measureInk(canvas: HTMLCanvasElement, r: { x0: number; y0: number; x1: number; y1: number }): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const w = Math.max(1, r.x1 - r.x0);
  const h = Math.max(1, r.y1 - r.y0);
  const { data } = ctx.getImageData(r.x0, r.y0, w, h);
  let ink = 0; let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    n++;
    if (lum < 140) ink++;
  }
  return ink / Math.max(1, n);
}

function cropDataUrl(canvas: HTMLCanvasElement, r: { x0: number; y0: number; x1: number; y1: number }): string {
  const w = Math.max(1, r.x1 - r.x0);
  const h = Math.max(1, r.y1 - r.y0);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(canvas, r.x0, r.y0, w, h, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.85);
}

/**
 * A wide crop with the region of interest outlined.
 *
 * ⚠️ THE OUTLINE IS DRAWN ON A COPY, NEVER ON THE PAGE CANVAS. The oriented
 * page canvases are reused for every row on that page and for ink measurement;
 * stroking a rectangle onto one would leave that rectangle in every later crop
 * and, worse, in the ink readings taken after it.
 */
function contextCrop(
  canvas: HTMLCanvasElement,
  region: CropRegion,
  highlight: CropRegion | null,
  maxWidth = 1400,
): string {
  const rx0 = Math.max(0, Math.floor(region.x0));
  const ry0 = Math.max(0, Math.floor(region.y0));
  const rx1 = Math.min(canvas.width, Math.ceil(region.x1));
  const ry1 = Math.min(canvas.height, Math.ceil(region.y1));
  const w = Math.max(1, rx1 - rx0);
  const h = Math.max(1, ry1 - ry0);

  // Upscale small crops as well as downscale large ones: a row band off a
  // phone photo can be 40px tall, and a 40px-tall image of someone's
  // handwriting is not something you can read a decision off.
  const scale = Math.min(3, Math.max(1, maxWidth / w));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, rx0, ry0, w, h, 0, 0, c.width, c.height);

  if (highlight) {
    const hx = (highlight.x0 - rx0) * scale;
    const hy = (highlight.y0 - ry0) * scale;
    const hw = (highlight.x1 - highlight.x0) * scale;
    const hh = (highlight.y1 - highlight.y0) * scale;
    // Amber, matching the "needs you" tone used throughout admin, and drawn
    // twice so it survives on both a white form and a grey photocopy.
    ctx.lineWidth = Math.max(2, Math.round(3 * scale));
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeRect(hx - 2, hy - 2, hw + 4, hh + 4);
    ctx.strokeStyle = '#D97706';
    ctx.strokeRect(hx, hy, hw, hh);
  }
  return c.toDataURL('image/jpeg', 0.86);
}

/** The row band, widened to the whole form and padded by a row either side. */
function rowContextRegion(canvas: HTMLCanvasElement, band: RowBand): CropRegion {
  const pad = Math.max(8, Math.round((band.y1 - band.y0) * 1.1));
  return {
    x0: Math.floor(canvas.width * 0.03),
    y0: band.y0 - pad,
    x1: Math.ceil(canvas.width * 0.99),
    y1: band.y1 + pad,
  };
}

export function detectInkedRowsOnPage(canvas: HTMLCanvasElement, inkThreshold = 0.045) {
  const bands = findRowBands(canvas);
  const marked: Array<{
    rowIndex: number; ink: number; cropDataUrl: string;
    contextCropDataUrl: string; contextRegion: CropRegion; markRegion: CropRegion;
  }> = [];
  for (let i = 0; i < bands.length; i++) {
    const rect = qntyRect(canvas, bands[i]);
    const ink = measureInk(canvas, rect);
    if (ink >= inkThreshold) {
      const region = rowContextRegion(canvas, bands[i]);
      marked.push({
        rowIndex: i,
        ink,
        cropDataUrl: cropDataUrl(canvas, rect),
        contextCropDataUrl: contextCrop(canvas, region, rect),
        contextRegion: region,
        markRegion: rect,
      });
    }
  }
  return { bands, marked };
}

/**
 * Does a person have to look at this before it can be used?
 *
 * ONE DEFINITION, USED EVERYWHERE. The review list, the "needs you" panel and
 * the counts on screen all call this, so a row can never be quietly confirmed
 * in one place and flagged in another — which is the failure that makes people
 * stop trusting a review screen and just hit Apply.
 *
 * Deliberately generous. The cost of flagging a row that turned out fine is two
 * seconds of someone's attention. The cost of not flagging one is a boat
 * getting the wrong food, found out at the dock.
 */
export function needsHumanDecision(c: AnyCandidate): boolean {
  if (c.confidence === 'needs_review' || c.confidence === 'low') return true;
  if (!c.match) return true;
  if (c.suggestedQty == null) return true;
  if (c.kind === 'form_row') {
    // A mark that read as words rather than a number — "Cream", "Cs",
    // "Vegetarian". It means something to the cook and we must not guess.
    if (c.markNote && c.suggestedQty == null) return true;
    if (c.disagreement) return true;
  } else if (c.isCod) {
    // Who pays is never inferred from handwriting.
    return true;
  }
  return c.flags.length > 0;
}

/** Why it was flagged, in one line, for someone who has not read the code. */
export function decisionReason(c: AnyCandidate): string {
  if (!c.match) {
    return c.kind === 'write_in'
      ? 'Not found in the catalogue — say what it is, or keep it as a note.'
      : 'No catalogue row matched this line of the form.';
  }
  if (c.kind === 'form_row' && c.markNote && c.suggestedQty == null) {
    return `The mark reads “${c.markNote}”, which is not a quantity.`;
  }
  if (c.suggestedQty == null) return 'No quantity could be read from the mark.';
  if (c.kind === 'form_row' && c.disagreement) return c.disagreement;
  if (c.kind === 'write_in' && c.isCod) return 'Marked COD — confirm who is paying.';
  if (c.confidence === 'low') return 'Low-confidence match — check it against the crop.';
  return c.flags[0] || 'Needs a look.';
}

export function interpretMark(text: string | null): { qty: number | null; note: string | null } {
  if (!text) return { qty: null, note: null };
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return { qty: null, note: null };
  const num = t.match(/(\d+(?:\.\d+)?)/);
  if (num && /^[\d.\s/x×]+$/i.test(t)) {
    const q = Number(num[1]);
    if (q > 0 && q < 1000) return { qty: q, note: null };
  }
  if (/[a-zA-Z]/.test(t)) {
    // "3 Cream" → qty 3 + note Cream
    if (num) {
      const q = Number(num[1]);
      const note = t.replace(num[0], '').trim();
      if (q > 0 && q < 1000 && note) return { qty: q, note: note.slice(0, 80) };
    }
    return { qty: null, note: t.slice(0, 80) };
  }
  if (num) {
    const q = Number(num[1]);
    if (q > 0 && q < 1000) return { qty: q, note: null };
  }
  return { qty: null, note: t.slice(0, 80) };
}

const COD_RE = /\b(cod|c\.o\.d\.|cash\s*on\s*delivery|pay\s*on\s*delivery|venmo|cash\s*app|cashapp|personal)\b/i;

export function detectCod(text: string): { isCod: boolean; codName: string | null } {
  if (!COD_RE.test(text)) return { isCod: false, codName: null };
  // "COD John Smith" / "John — COD"
  const named = text.match(/cod[:\s-]+([A-Za-z][A-Za-z .'-]{1,40})/i)
    || text.match(/([A-Za-z][A-Za-z .'-]{1,40})\s*[—-]\s*cod/i);
  return { isCod: true, codName: named?.[1]?.trim() || null };
}

async function ocrImage(dataUrlOrCanvas: string | HTMLCanvasElement): Promise<string | null> {
  try {
    const Tesseract = await import('tesseract.js');
    const result = await Tesseract.recognize(dataUrlOrCanvas, 'eng', { logger: () => {} });
    return (result.data.text || '').trim() || null;
  } catch {
    return null;
  }
}

/** Parse write-in lines like "large Marshmallows 4 bags" / "Hickory Smoker Pellets 2 bags". */
export function parseWriteInLines(text: string): Array<{ raw: string; description: string; qty: number | null; isCod: boolean; codName: string | null }> {
  const out: Array<{ raw: string; description: string; qty: number | null; isCod: boolean; codName: string | null }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (line.length < 3) continue;
    if (/write\s*in|additional|notes?\s*:?$/i.test(line) && line.length < 24) continue;

    const { isCod, codName } = detectCod(line);
    let qty: number | null = null;
    let description = line;

    const lead = /^(\d+(?:\.\d+)?)\s+(.*)$/.exec(line);
    const trail = /^(.*?)\s+(\d+(?:\.\d+)?)\s*(bags?|bag|cases?|cs|ct|ea|pk|boxes?|box)?\s*$/i.exec(line);
    if (lead && lead[2].length > 2) {
      qty = Number(lead[1]);
      description = lead[2];
    } else if (trail && trail[1].length > 2) {
      description = trail[1];
      qty = Number(trail[2]);
    }

    // Strip trailing unit words from description when qty found
    description = description.replace(/\s+(bags?|cases?|cs|ct|ea|pk|boxes?)\s*$/i, '').trim();
    out.push({ raw: line, description, qty, isCod, codName });
  }
  return out;
}

async function extractWriteIns(
  canvas: HTMLCanvasElement,
  pageIndex: number,
  catalog: CatalogItem[],
  byUpc: Map<string, CatalogItem>,
): Promise<WriteInCandidate[]> {
  // Bottom ~18% of page — WRITE IN ITEMS block on Sinclair forms.
  const w = canvas.width;
  const h = canvas.height;
  const region = { x0: Math.floor(w * 0.06), y0: Math.floor(h * 0.82), x1: Math.floor(w * 0.94), y1: Math.floor(h * 0.97) };
  const crop = cropDataUrl(canvas, region);
  // The same block again, drawn large. OCR reads the small one; a person
  // deciding what "Vegetarian" means needs to see the handwriting.
  const contextCrop_ = contextCrop(canvas, region, null);
  const text = await ocrImage(crop);
  if (!text) return [];

  const lines = parseWriteInLines(text);
  // If OCR found a COD banner with no item lines, still surface it.
  if (!lines.length && detectCod(text).isCod) {
    const { isCod, codName } = detectCod(text);
    return [{
      kind: 'write_in',
      pageIndex,
      rawText: text.slice(0, 200),
      description: text.slice(0, 120),
      suggestedQty: null,
      match: null,
      matchHow: 'unmatched',
      confidence: 'needs_review',
      flags: ['COD note on write-in area — confirm attribution.'],
      codName,
      isCod,
      cropDataUrl: crop,
      contextCropDataUrl: contextCrop_,
      contextRegion: region,
    }];
  }

  return lines.map(l => {
    const m = matchWriteInToCatalog(l.description, catalog, byUpc);
    const flags = [...m.flags];
    if (l.isCod) flags.push(l.codName ? `COD for ${l.codName}` : 'Marked as COD');
    if (!l.qty) flags.push('No clear quantity — enter one or keep as a note.');
    return {
      kind: 'write_in' as const,
      pageIndex,
      rawText: l.raw,
      description: l.description,
      suggestedQty: l.qty,
      match: m.match,
      matchHow: m.how,
      confidence: m.confidence,
      flags,
      codName: l.codName,
      isCod: l.isCod,
      cropDataUrl: crop,
      contextCropDataUrl: contextCrop_,
      contextRegion: region,
    };
  });
}

export async function scanPaperPages(opts: {
  canvases: HTMLCanvasElement[];
  layoutItems: FormLayoutItem[];
  catalog: CatalogItem[];
  runOcr?: boolean;
  onProgress?: (p: ScanProgress) => void;
}): Promise<ScanResult> {
  const { canvases, layoutItems, catalog, runOcr = true, onProgress } = opts;
  const indexes = buildCatalogIndexes(catalog);
  const candidates: ScanCandidate[] = [];
  const writeIns: WriteInCandidate[] = [];
  const pageOrientations: Array<0 | 90 | 180 | 270> = [];
  const summaryFlags: string[] = [];
  let layoutCursor = 0;

  const oriented: HTMLCanvasElement[] = [];
  for (let p = 0; p < canvases.length; p++) {
    onProgress?.({ phase: 'orient', page: p + 1, pages: canvases.length, message: `Straightening page ${p + 1} of ${canvases.length}…` });
    const { canvas, rotation } = autoOrientCanvas(canvases[p]);
    oriented.push(canvas);
    pageOrientations.push(rotation);
    if (rotation !== 0) summaryFlags.push(`Page ${p + 1} was rotated ${rotation}° automatically.`);
  }

  for (let p = 0; p < oriented.length; p++) {
    onProgress?.({ phase: 'detect', page: p + 1, pages: oriented.length, message: `Reading quantities on page ${p + 1} of ${oriented.length}…` });
    const { bands, marked } = detectInkedRowsOnPage(oriented[p]);
    const markedByRow = new Map(marked.map(m => [m.rowIndex, m]));

    for (let r = 0; r < bands.length; r++) {
      if (layoutCursor >= layoutItems.length) break;
      const layout = layoutItems[layoutCursor];
      layoutCursor++;
      const hit = markedByRow.get(r);
      if (!hit) continue;

      const { match, how, disagreement, confidence, flags } = matchLayoutToCatalog(
        layout, indexes.byUpc, indexes.byDescPkg, indexes.byDesc, indexes.bySeq,
      );

      let ocrText: string | null = null;
      if (runOcr) {
        onProgress?.({ phase: 'ocr', page: p + 1, pages: oriented.length, message: `Reading handwriting on page ${p + 1}…` });
        ocrText = await ocrImage(hit.cropDataUrl);
      }
      const { qty, note } = interpretMark(ocrText);
      const rowFlags = [...flags];
      if (qty == null && note) rowFlags.push(`Handwriting looks like a note (“${note}”), not a number.`);
      if (qty == null && !note) rowFlags.push('Could not read a quantity — type it from the crop.');
      if (pageOrientations[p] !== 0) rowFlags.push(`Page auto-rotated ${pageOrientations[p]}°.`);

      candidates.push({
        kind: 'form_row',
        layoutSeq: layout.seq,
        layout,
        pageIndex: p,
        rowIndexOnPage: r,
        cropDataUrl: hit.cropDataUrl,
        ink: hit.ink,
        match,
        matchHow: how,
        confidence: qty == null ? 'needs_review' : confidence,
        flags: rowFlags,
        disagreement,
        suggestedQty: qty,
        markNote: note,
        ocrText,
        orientationApplied: pageOrientations[p],
        contextCropDataUrl: hit.contextCropDataUrl,
        contextRegion: hit.contextRegion,
        markRegion: hit.markRegion,
      });
    }
  }

  // Write-in / COD block on the last 1–2 pages (Scott Noble–class forms).
  const writeInPages = oriented.length <= 1
    ? [oriented.length - 1]
    : [oriented.length - 2, oriented.length - 1].filter(i => i >= 0);
  for (const pi of [...new Set(writeInPages)]) {
    onProgress?.({ phase: 'writeins', page: pi + 1, pages: oriented.length, message: `Reading write-ins on page ${pi + 1}…` });
    const found = await extractWriteIns(oriented[pi], pi, catalog, indexes.byUpc);
    writeIns.push(...found);
  }
  if (writeIns.length) summaryFlags.push(`Found ${writeIns.length} write-in line${writeIns.length === 1 ? '' : 's'} on the last page(s).`);
  if (candidates.some(c => c.confidence === 'needs_review' || !c.match)) {
    summaryFlags.push('Some rows need a human look — they’re highlighted below.');
  }

  onProgress?.({ phase: 'done', page: oriented.length, pages: oriented.length, message: 'Ready for your review' });
  return { candidates, writeIns, pageOrientations, summaryFlags };
}
