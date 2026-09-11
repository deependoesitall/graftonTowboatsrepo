// src/lib/paper-form-scan.ts
//
// PAPER SCAN → REVIEW CANDIDATES for the staff Order Builder.
//
// Client-side (Vercel 30s): render PDF/photos → auto-orient each page →
// detect inked QNTY cells → match to order-form layout / catalog →
// OCR write-in blocks on the last page(s). Human always confirms qty.

import type { FormLayoutItem } from '@/lib/form-layout-apply';

import { rectifyPage } from '@/lib/paper-form-rectify';
import {
  type MarkShape,
  type MarkGroup,
  isolateMark,
  markImage,
  groupMarks,
} from '@/lib/paper-form-marks';

// One import surface for the review screens: they should not have to know
// whether a thing came from the scanner or the mark matcher.
export { similarMarks, GROUP_THRESHOLD, SUGGEST_THRESHOLD, PRETICK_THRESHOLD } from '@/lib/paper-form-marks';
export type { MarkShape, MarkGroup } from '@/lib/paper-form-marks';

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
  /**
   * Was handwriting reading actually run on this row?
   *
   * Without this the flagging cannot tell "the machine tried and failed" from
   * "the machine was never asked" — and those need opposite treatment. The
   * first is a genuine unknown; the second is every row on the form, which is
   * not a flag, it is the normal way to work when the operator has turned
   * reading off and intends to type the quantities themselves.
   */
  ocrAttempted: boolean;
  /** Where `contextCropDataUrl` was taken from, for anyone who needs the page. */
  contextRegion: CropRegion;
  /** The QNTY cell itself, in the same page coordinates. */
  markRegion: CropRegion;
  /**
   * THE MARK ON ITS OWN, BIG.
   *
   * The pencil stroke cut away from the printed rules, from the row above
   * dropping its tail through the line, and from the empty half of the cell —
   * then blown up. This is what a person actually reads the number off, and it
   * is a different picture from `cropDataUrl` (the whole cell, rules and all)
   * on purpose.
   */
  markImageDataUrl: string | null;
  /**
   * The normalised shape, for matching this mark against the others on the
   * same order. Null when the cell held nothing that could be isolated.
   */
  shape: MarkShape | null;
  /**
   * Which set of look-alike marks this one belongs to. Every member of a group
   * is the same digit in the same hand, so one answer covers all of them.
   * -1 when the mark could not be shaped.
   */
  groupId: number;
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
  /** Where the quantity column was found, and whether to trust it. */
  qntyColumn: QntyColumn;
  candidates: ScanCandidate[];
  /**
   * Marks that look like the same digit, biggest set first. Indexes are into
   * `candidates`.
   */
  markGroups: MarkGroup[];
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
    else if (hits.length > 1) flags.push(`Several catalog sizes match “${layout.description}”.`);
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
    flags.push('No catalog match for this form row.');
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
  else flags.push('Write-in not in catalog — will go to order notes unless you match it.');
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
/**
 * Downscaled copy used for every measurement that only needs shape, not detail.
 *
 * Orientation used to be decided by rotating the FULL page four times and
 * reading all the pixels of each — four multi-megabyte allocations and four
 * full getImageData calls per page, repeated twenty times. On a phone that is
 * most of the wait, and it is wasted: whether a page is upside down is visible
 * in a thumbnail.
 */
function probeOf(canvas: HTMLCanvasElement, target = 500): HTMLCanvasElement {
  const scale = Math.min(1, target / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * scale));
  c.height = Math.max(1, Math.round(canvas.height * scale));
  c.getContext('2d', { willReadFrequently: true })!
    .drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

/** Frees a canvas's backing store. Dropping the reference is not enough on iOS. */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}



/**
 * Which edge column is the printed Category column?
 *
 * ⚠️ THIS IS THE ONLY THING THAT CAN TELL 0° FROM 180°.
 *
 * Rule-density scoring counts horizontal lines, and a page turned upside
 * down has exactly the same horizontal rules as one the right way up. The two
 * scores are identical, the loop keeps the first, and 180° could never be
 * detected — which is not a corner case: a real twenty-page scan of the Scott
 * Noble order came through with sixteen of its pages upside down.
 *
 * The form itself gives us an asymmetry. The far-left column is the Category
 * ("Produce", "Meat") printed on every single row, and the far-right of the
 * table is the quantity column, which is blank except for a few pencil marks.
 * Dense on the left and sparse on the right means upright; the reverse means
 * the page is flipped. On that real scan the two classes separated by a factor
 * of ten — 0.089 vs 0.027 — so this is a wide, safe margin rather than a
 * hair-splitting threshold.
 */
/**
 * How lopsided the ink is between the left and right edges of a page, as a
 * fraction of the ink in both — positive means the dense side is on the left,
 * which on this form means upright.
 *
 * ⚠️ RELATIVE, NOT ABSOLUTE. A pale fax and a heavy photocopy of the same page
 * differ by a factor of two in how much of them reads as ink, so any fixed
 * cutoff on the raw difference is really a cutoff on scan darkness. The ratio
 * is the same either way: measured over the Scott Noble order at 94, 108, 150,
 * 200 and 300 dpi it never leaves ±0.37…±0.57, against a decision line at 0.12.
 */
function edgeInkContrast(canvas: HTMLCanvasElement): number {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const band = (x0f: number, x1f: number) => {
    const x0 = Math.floor(w * x0f), x1 = Math.floor(w * x1f);
    const y0 = Math.floor(h * 0.12), y1 = Math.floor(h * 0.92);
    const { data } = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    let dark = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      n++;
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 140) dark++;
    }
    return dark / Math.max(1, n);
  };
  const left = band(0.03, 0.14);
  const right = band(0.86, 0.97);
  // Two blank strips. Nothing to go on, so say nothing rather than flipping on
  // paper grain.
  if (left + right < 0.01) return 0;
  return (left - right) / (left + right);
}

/** Below this the page is treated as "no clear answer" and left alone. */
const ORIENT_MARGIN = 0.12;

export function autoOrientCanvas(canvas: HTMLCanvasElement): { canvas: HTMLCanvasElement; rotation: 0 | 90 | 180 | 270 } {
  /**
   * ⚠️ MEASURE THE FULL-SIZE PAGE. NEVER A THUMBNAIL.
   *
   * This is the bug that made the whole scanner useless on a real order, and it
   * is worth spelling out because it looks so harmless.
   *
   * The check used to run on a 500px probe of the page, on the reasoning that
   * deciding which way up something is does not need detail. It does. The signal
   * here is the Category column — the words "Grocery - Low" printed down the
   * left of every row — and at full size those strokes are one to two pixels
   * wide and solidly black. Shrink a 1275px page to 500 and each stroke is
   * averaged with the white around it into a mid grey that never crosses the ink
   * threshold. Both edge bands then read almost nothing:
   *
   *     full page   left 0.031  right 0.094   →  -0.51, flipped, certain
   *     500px probe left 0.004  right 0.005   →  +0.09, noise
   *
   * Every page of the Scott Noble order came back within ±0.009 of zero on the
   * probe, so which pages got turned was decided by rounding. Sixteen pages were
   * upside down; the scanner turned a different fifteen. The quantity column on
   * an unturned page is where the item DESCRIPTION is, so it read printed words
   * as handwriting, produced sixty-six "marks need you", and showed the operator
   * crops of upside-down product names.
   *
   * The bands are 11% of the width each, so reading them off the full canvas is
   * about a fifth of one page's pixels — cheaper than making the thumbnail was.
   *
   * ⚠️ AND THE SHAPE OF THE PAGE DECIDES THE AXIS, NOT INK DENSITY.
   *
   * An earlier version chose between portrait and landscape by counting
   * horizontal rules and got 19 of 20 pages wrong, because at probe scale the
   * rules vanish while the Category column survives as a stripe that reads as
   * dozens of rules when the page is on its side. A portrait page is upright or
   * upside down; it is not sideways.
   */
  const portrait = canvas.height >= canvas.width;
  const axis: Array<0 | 90 | 180 | 270> = portrait ? [0, 180] : [90, 270];

  let contrast: number;
  if (portrait) {
    contrast = edgeInkContrast(canvas);
  } else {
    // Only a sideways page needs a copy made to measure, and those are rare.
    const turned = rotateCanvas(canvas, 90);
    contrast = edgeInkContrast(turned);
    releaseCanvas(turned);
  }

  const best: 0 | 90 | 180 | 270 = contrast < -ORIENT_MARGIN ? axis[1] : axis[0];
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
    /**
     * ⚠️ SCALE IS A MEMORY BUDGET, NOT A QUALITY DIAL.
     *
     * This rendered every page at scale 2 — 1224 × 1584 for US Letter, about
     * 7.8 MB of canvas each. Twenty pages is 155 MB held at once, before the
     * orientation pass makes rotated copies and the rectifier allocates an
     * output canvas. iOS Safari caps total canvas memory well below that and
     * does not fail loudly: canvases come back blank, or the tab reloads. An
     * 11 MB scan of the Scott Noble order hits it every time.
     *
     * 1.5 is ~108 dpi, which is plenty to FIND a pencil mark. The crop handed
     * to OCR is upscaled separately (see contextCrop), so reading the digit
     * does not depend on this number. Long documents drop further, because the
     * cap is on the total, not the page.
     */
    const scale = doc.numPages > 12 ? 1.3 : 1.5;
    const viewport = page.getViewport({ scale });
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
  /**
   * ⚠️ THE ROW GRID DECIDES WHICH ITEM A MARK BELONGS TO. GET IT WRONG AND
   * EVERYTHING DOWNSTREAM IS WRONG IN A WAY THAT STILL LOOKS PLAUSIBLE.
   *
   * The old version tested every horizontal line against ONE fixed darkness
   * threshold, and if fewer than ten rules cleared it, gave up and laid a flat
   * 48-row grid over the page from 14% to 88%. On a real scan that happened on
   * a third of the pages — photocopied rules come out faint — and the
   * consequences were not subtle: a mark got attributed to whatever row the
   * invented grid happened to put under it, so the review screen offered
   * "Pork Steaks" beside a crop of the Dairy section, and the OCR read printed
   * text out of the wrong cell and reported quantities like "~" and "Rwy".
   *
   * Two changes. The threshold now ADAPTS: it starts strict and relaxes until
   * it finds a plausible number of rules, because "faint" is a property of the
   * scan, not of the form. And when there still aren't enough, the fallback
   * grid is built from the spacing of the rules that WERE found — a real pitch
   * and a real offset measured off this page — instead of a guess that happens
   * to be right on the pages that never needed it.
   */
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

  const rulesAt = (threshold: number): number[] => {
    const out: number[] = [];
    for (let y = yStart + 2; y < yEnd - 2; y++) {
      if (lineScore[y] >= threshold && lineScore[y] >= lineScore[y - 1] && lineScore[y] >= lineScore[y + 1]) {
        if (!out.length || y - out[out.length - 1] > 8) out.push(y);
      }
    }
    return out;
  };

  // A full page of this form carries roughly 45–60 ruled rows. Relax until the
  // count is in that neighbourhood rather than insisting on one darkness.
  let rules: number[] = [];
  for (const t of [0.22, 0.18, 0.14, 0.11, 0.08, 0.06]) {
    rules = rulesAt(t);
    if (rules.length >= 25) break;
  }

  const bands: RowBand[] = [];
  if (rules.length >= 8) {
    for (let i = 0; i < rules.length - 1; i++) {
      const y0 = rules[i] + 1;
      const y1 = rules[i + 1] - 1;
      if (y1 - y0 >= 8 && y1 - y0 <= Math.floor(h * 0.08)) bands.push({ y0, y1 });
    }
  }
  if (bands.length >= 10) return bands;

  // Not enough usable rules. Build the grid from the page's OWN spacing: the
  // median gap between whatever rules were found is the row pitch, and the
  // first rule is where the table starts. Only if there is nothing at all to
  // measure does this fall back to proportions of the page.
  bands.length = 0;
  let pitch = 0;
  let top = Math.floor(h * 0.14);
  let bottom = Math.floor(h * 0.88);
  if (rules.length >= 4) {
    const gaps: number[] = [];
    for (let i = 1; i < rules.length; i++) {
      const g = rules[i] - rules[i - 1];
      if (g >= 8 && g <= h * 0.08) gaps.push(g);
    }
    if (gaps.length >= 3) {
      gaps.sort((a, b) => a - b);
      pitch = gaps[Math.floor(gaps.length / 2)];
      top = rules[0];
      bottom = rules[rules.length - 1];
    }
  }
  if (!pitch) pitch = (bottom - top) / 48;

  for (let y = top; y + pitch <= bottom + 1; y += pitch) {
    bands.push({ y0: Math.round(y), y1: Math.round(y + pitch) - 1 });
  }
  return bands;
}

/**
 * ⚠️ THE QUANTITY COLUMN IS AT 0.64–0.69, NOT 0.86–0.97.
 *
 * This read 0.86–0.97 of the page width, which on a real Sinclair form is the
 * blank right-hand MARGIN — outside the table altogether. Measured on the Scott
 * Noble scan the table runs 0.08 → 0.87, and the columns fall:
 *
 *   Category .08–.18 · UPC .18–.23 · Description .23–.54
 *   Pack .54–.64 · QNTY .64–.69 · UOM .70–.75 · Price .76–.82
 *
 * Reading the margin meant measuring ink on blank paper: with the pages the
 * right way up the detector found 2 marks in a 20-page order carrying about 30.
 * Upside down, the same window landed on the Category column — a printed word
 * on every row — and it reported 640.
 */
export interface QntyColumn {
  lo: number;
  hi: number;
  /**
   * Did calibration actually find the table, or is this the fallback?
   *
   * ⚠️ THIS IS NOT COSMETIC. Everything downstream measures ink inside this
   * stripe. Placed wrongly it does not degrade — it reads a different column
   * and reports confident nonsense, which is the single worst outcome this
   * feature can produce. When the geometry cannot be trusted the operator is
   * told and given the control, rather than handed a clean-looking list of
   * quantities taken from the pack-size column.
   */
  confident: boolean;
  /** How far the table's own borders lean, in page widths. >0.015 ≈ a photo. */
  skew: number;
}

/** Where the column sits when calibration has nothing to work with. */
const QNTY_COL_DEFAULT: QntyColumn = { lo: 0.640, hi: 0.690, confident: false, skew: 0 };

/**
 * CALIBRATE THE COLUMN ONCE, FROM THE WHOLE DOCUMENT.
 *
 * Finding the table's rules on a single page does not work: on this scan half
 * the pages yielded one vertical rule or none at all — photocopied rules simply
 * come out too faint to peak above the printed text around them. Averaging the
 * column-ink profile over twenty pages turns those faint rules into clear ones,
 * because the rules are in the same place on every page and the text is not.
 *
 * The profile is resampled into fixed bins first, so pages that were scanned or
 * photographed at different widths still stack on top of each other.
 *
 * From there the table's own edges give a coordinate system that survives any
 * crop or zoom: the quantity column occupies 0.711–0.775 of the table's width,
 * and each edge is snapped to a real detected rule when one is close. A form
 * cropped tighter or photographed at an angle moves in page fractions and stays
 * put in table fractions.
 */
/**
 * How far the table's left border moves between the top and bottom of a page.
 *
 * On a flatbed scan this is a pixel or two. On a hand-held photo the page is
 * rotated a few degrees and tilted away from the lens, so the border walks
 * sideways as it goes down — and every column walks with it. A single stripe at
 * a fixed fraction of the page width then cuts diagonally across the table,
 * which is exactly how a quantity reader ends up reading pack sizes.
 */
function borderSkew(canvas: HTMLCanvasElement): number {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const edgeAt = (yf: number): number | null => {
    const y = Math.floor(h * yf);
    const band = Math.max(4, Math.round(h / 200));
    const { data } = ctx.getImageData(0, y, Math.floor(w * 0.45), band * 2);
    const cols = Math.floor(w * 0.45);
    for (let x = Math.floor(w * 0.01); x < cols; x++) {
      let dark = 0;
      for (let r = 0; r < band * 2; r++) {
        const i = ((r * cols) + x) * 4;
        if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 150) dark++;
      }
      if (dark / (band * 2) > 0.6) return x / w;
    }
    return null;
  };
  const top = edgeAt(0.20), bottom = edgeAt(0.82);
  if (top == null || bottom == null) return 1;   // can't see a border at all
  return Math.abs(top - bottom);
}

export function calibrateQntyColumn(canvases: HTMLCanvasElement[], anyPhotos = true): QntyColumn {
  // Column positions are a shape question, so this runs on probes too. At full
  // size it was reading every pixel of every page a second time purely to find
  // four vertical lines.
  const BINS = 400;
  const acc = new Float64Array(BINS);
  let used = 0;

  for (const full of canvases) {
    if (!full.width || !full.height) continue;
    const canvas = probeOf(full, 700);
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const y0 = Math.floor(h * 0.14), y1 = Math.floor(h * 0.90);
    const { data } = ctx.getImageData(0, y0, w, Math.max(1, y1 - y0));
    const rows = Math.max(1, y1 - y0);
    const sum = new Float64Array(BINS);
    const cnt = new Float64Array(BINS);
    for (let x = 0; x < w; x++) {
      let dark = 0;
      for (let y = 0; y < rows; y++) {
        const i = ((y * w) + x) * 4;
        if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 150) dark++;
      }
      const b = Math.min(BINS - 1, Math.floor((x * BINS) / w));
      sum[b] += dark / rows;
      cnt[b] += 1;
    }
    for (let b = 0; b < BINS; b++) acc[b] += sum[b] / Math.max(1, cnt[b]);
    releaseCanvas(canvas);
    used++;
  }
  if (!used) return QNTY_COL_DEFAULT;
  // Worst skew across the batch — one bad photo is enough to make fixed
  // fractions unsafe for the whole run.
  // Skew is a camera problem. Measuring it on pdf.js output only produces false
  // positives — a faint rule found at one height and a column of text at
  // another look like a leaning page when nothing is leaning.
  let skew = 0;
  if (anyPhotos) {
    for (const c of canvases) {
      if (!c.width || !c.height) continue;
      const pr = probeOf(c, 700);
      skew = Math.max(skew, borderSkew(pr));
      releaseCanvas(pr);
    }
  }
  for (let b = 0; b < BINS; b++) acc[b] /= used;

  const peaks: number[] = [];
  for (let b = 1; b < BINS - 1; b++) {
    if (acc[b] > 0.16 && acc[b] >= acc[b - 1] && acc[b] >= acc[b + 1]) {
      if (!peaks.length || b - peaks[peaks.length - 1] > 3) peaks.push(b);
    }
  }
  if (peaks.length < 4) return { ...QNTY_COL_DEFAULT, skew };

  const left = peaks[0] / BINS;
  const right = peaks[peaks.length - 1] / BINS;
  const span = right - left;
  // A table that came out implausibly narrow or wide means the peaks were text,
  // not rules. Don't build a coordinate system on it.
  if (span < 0.45 || span > 0.95) return { ...QNTY_COL_DEFAULT, skew };

  const snap = (target: number): number => {
    let best = target, dist = Infinity;
    for (const b of peaks) {
      const x = b / BINS;
      const d = Math.abs(x - target);
      if (d < dist) { dist = d; best = x; }
    }
    return dist <= 0.025 ? best : target;
  };

  const lo = snap(left + span * 0.711);
  const hi = snap(left + span * 0.775);
  if (hi - lo < 0.02 || hi - lo > 0.14) return { ...QNTY_COL_DEFAULT, skew };
  // A leaning table means a fixed vertical stripe cannot follow the column, no
  // matter how well this run located it at one height.
  return { lo, hi, skew, confident: skew <= 0.015 };
}

function qntyRect(canvas: HTMLCanvasElement, band: RowBand, col: QntyColumn) {
  const w = canvas.width;
  return {
    x0: Math.floor(w * col.lo), y0: band.y0,
    x1: Math.floor(w * col.hi), y1: band.y1,
  };
}

/**
 * Where the pencil actually is, found without trusting the row grid.
 *
 * Row banding fails on about a third of real pages — faint ruled lines send it
 * to an evenly spaced fallback grid that straddles two printed rows and catches
 * the column rules at the cell edges. Asking "how much ink is in this row's
 * quantity cell" on top of that grid mostly measures the grid's own error.
 *
 * A mark is found directly instead: the quantity column is taken as one tall
 * strip, inset past its vertical rules, and scanned for runs of rows carrying
 * ink. Each run is one mark. The row grid is then used only to say WHICH item
 * the mark belongs to, which is the thing it is reliable for.
 */
function findMarkRuns(canvas: HTMLCanvasElement, col: QntyColumn): Array<{ y0: number; y1: number; ink: number }> {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const inset = Math.max(4, Math.round(w * 0.004));
  const x0 = Math.floor(w * col.lo) + inset;
  const x1 = Math.floor(w * col.hi) - inset;
  // Skip the letterhead: on page one the vessel block sits across this same
  // column range and is not a quantity.
  const yTop = Math.floor(h * 0.13);
  const yBot = Math.floor(h * 0.93);
  const cw = Math.max(1, x1 - x0);
  const { data } = ctx.getImageData(x0, yTop, cw, Math.max(1, yBot - yTop));

  const rowInk: number[] = [];
  for (let y = 0; y < yBot - yTop; y++) {
    let dark = 0;
    for (let x = 0; x < cw; x++) {
      const i = ((y * cw) + x) * 4;
      /**
       * ⚠️ 155, NOT 140, AND THE DIFFERENCE IS TEN MARKS.
       *
       * A twenty-page order is rendered at pdf.js scale 1.3 to stay inside
       * iOS's canvas budget — about 94 dpi, where a pencil stroke is a pixel
       * wide and comes off the scaler as mid grey rather than black. At 140 the
       * scanner found 39 of the 49 marks on the Scott Noble order at that
       * scale and all of them at 300 dpi, which is exactly the kind of bug that
       * passes every test done on a good scan and loses a fifth of a real
       * order on a phone. Measured at 94/108/150/200/300 dpi, 155 finds
       * 46–58 at every one of them.
       */
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 155) dark++;
    }
    rowInk.push(dark / cw);
  }

  const runs: Array<{ y0: number; y1: number; ink: number }> = [];
  // ⚠️ TUNED FOR RECALL, ON PURPOSE.
  //
  // Measured against the Scott Noble order: 0.12 found 11 marks, 0.09 found 27,
  // 0.07 found 37. Nothing here is ever added without a person confirming it,
  // so a spare detection costs one tap to dismiss while a missed one is silent
  // — the boat just doesn't get the item and nobody learns why.
  const ON = 0.05;
  /**
   * ⚠️ AND AN UPPER BOUND, BECAUSE A SOLID BAR IS NOT A PENCIL MARK.
   *
   * Reading grey as ink also picks up the scanner's dark edge at the top of
   * page one, which fills the whole column for 88 rows. Handwriting never
   * comes close: across the real order the densest genuine mark averages 0.49
   * of the column width, while the two bars measure 0.93 and 1.00.
   */
  const SOLID = 0.55;
  const MIN_H = Math.max(6, Math.round(h * 0.005));
  let start: number | null = null;
  for (let y = 0; y <= rowInk.length; y++) {
    const on = y < rowInk.length && rowInk[y] > ON;
    if (on && start === null) start = y;
    if (!on && start !== null) {
      if (y - start >= MIN_H) {
        const slice = rowInk.slice(start, y);
        const ink = slice.reduce((a, b) => a + b, 0) / slice.length;
        if (ink <= SOLID) runs.push({ y0: start + yTop, y1: y + yTop, ink });
      }
      start = null;
    }
  }
  return runs;
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

export function detectInkedRowsOnPage(
  canvas: HTMLCanvasElement,
  col: QntyColumn = QNTY_COL_DEFAULT,
) {
  const bands = findRowBands(canvas);
  const marked: Array<{
    rowIndex: number; ink: number; cropDataUrl: string;
    contextCropDataUrl: string; contextRegion: CropRegion; markRegion: CropRegion;
    markImageDataUrl: string | null; shape: MarkShape | null;
  }> = [];
  // One entry per PENCIL MARK, matched to the row it sits on — not one per row
  // that happened to measure dark.
  const used = new Set<number>();
  let unplaced = 0;
  for (const run of findMarkRuns(canvas, col)) {
    const mid = (run.y0 + run.y1) / 2;
    /**
     * ⚠️ IF THE NEAREST ROW IS TAKEN, TRY THE NEXT ONE — DO NOT THROW THE MARK
     * AWAY.
     *
     * Two marks on consecutive rows land close together, and where the rule
     * between them was faint enough that the row finder merged the pair into one
     * band, the second mark used to be dropped on the spot. Silently: the boat
     * simply did not get that item. Walking outwards to the nearest row nobody
     * has claimed recovers those, and the distance test below still refuses
     * anything that is not really on a row.
     */
    const order = bands
      .map((b, i) => ({ i, d: Math.abs((b.y0 + b.y1) / 2 - mid) }))
      .sort((a, b) => a.d - b.d);
    let best = -1;
    for (const { i, d } of order) {
      // A mark further than a row's height from every row center is not on a row
      // — a margin scribble, a staple shadow, the footer.
      if (d > (bands[i].y1 - bands[i].y0) * 1.2) break;
      if (used.has(i)) continue;
      best = i; break;
    }
    if (best < 0) { unplaced++; continue; }
    const band = bands[best];
    used.add(best);

    const rect = qntyRect(canvas, band, col);
    const region = rowContextRegion(canvas, band);
    /**
     * ⚠️ CUT THE MARK OUT OF THE ROW, NOT OUT OF THE BAND.
     *
     * The band runs rule to rule and the handwriting on this form does not
     * respect the rules — the digit above regularly drops its tail below the
     * line and the one below pokes up through it. Handing the isolator the run
     * the ink was actually found in tells it which strokes are THIS row's, and
     * that is the difference between a clean picture of a 2 and a picture of a
     * 2 with half a 3 above it.
     */
    const padRun = Math.max(3, Math.round((run.y1 - run.y0) * 0.35));
    const markRect = {
      x0: rect.x0,
      x1: rect.x1,
      y0: Math.max(band.y0 - 2, run.y0 - padRun),
      y1: Math.min(band.y1 + 2, run.y1 + padRun),
    };
    const iso = isolateMark(canvas, markRect, { y0: run.y0, y1: run.y1 });
    marked.push({
      rowIndex: best,
      ink: run.ink,
      cropDataUrl: cropDataUrl(canvas, rect),
      contextCropDataUrl: contextCrop(canvas, region, rect),
      contextRegion: region,
      markRegion: rect,
      markImageDataUrl: iso ? markImage(canvas, iso.box) : null,
      shape: iso ? iso.shape : null,
    });
  }
  marked.sort((a, b) => a.rowIndex - b.rowIndex);
  return { bands, marked, unplaced };
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
  // A missing quantity is an unknown only when something tried to read it.
  // With reading switched off the operator is typing every quantity by hand in
  // the list below, and flagging all of them says nothing.
  if (c.suggestedQty == null) {
    if (c.kind === 'write_in') return true;
    if (c.ocrAttempted) return true;
  }
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
      ? 'Not found in the catalog — say what it is, or keep it as a note.'
      : 'No catalog row matched this line of the form.';
  }
  if (c.kind === 'form_row' && c.markNote && c.suggestedQty == null) {
    return `The mark reads “${c.markNote}”, which is not a quantity.`;
  }
  if (c.suggestedQty == null) {
    return c.kind === 'form_row' && !c.ocrAttempted
      ? 'Marked on the form — type the quantity from the crop.'
      : 'No quantity could be read from the mark.';
  }
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

/**
 * Read a region and hand back every word with where it sits on the page.
 *
 * Used to find PRINTED headings, which is the one thing OCR on this form is
 * genuinely good at.
 */
async function ocrWords(
  canvas: HTMLCanvasElement,
  region: CropRegion,
): Promise<Array<{ text: string; y0: number; y1: number }>> {
  try {
    const Tesseract = await import('tesseract.js');
    const result = await Tesseract.recognize(cropDataUrl(canvas, region), 'eng', { logger: () => {} });
    // tesseract.js has moved word boxes around between versions; take them from
    // wherever they are rather than depending on one shape.
    const data = result.data as unknown as {
      words?: Array<{ text?: string; bbox?: { y0: number; y1: number } }>;
      blocks?: unknown;
    };
    const out: Array<{ text: string; y0: number; y1: number }> = [];
    const push = (t: unknown, bb: unknown) => {
      const text = typeof t === 'string' ? t.trim() : '';
      const box = bb as { y0?: number; y1?: number } | undefined;
      if (!text || !box || typeof box.y0 !== 'number') return;
      out.push({ text, y0: region.y0 + box.y0, y1: region.y0 + (box.y1 ?? box.y0) });
    };
    if (Array.isArray(data.words)) {
      for (const wd of data.words) push(wd?.text, wd?.bbox);
    }
    if (!out.length && data.blocks) {
      // Walk whatever nesting this version used until words turn up.
      const walk = (node: unknown) => {
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (!node || typeof node !== 'object') return;
        const o = node as Record<string, unknown>;
        if (typeof o.text === 'string' && o.bbox) push(o.text, o.bbox);
        for (const k of ['blocks', 'paragraphs', 'lines', 'words', 'symbols']) {
          if (o[k]) walk(o[k]);
        }
      };
      walk(data.blocks);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Where the WRITE IN ITEMS block starts on a page, in page pixels, or null when
 * the page has no such block.
 *
 * ⚠️ THE BLOCK IS FOUND, NEVER ASSUMED, AND MOST PAGES DO NOT HAVE ONE.
 *
 * This used to read a fixed window — the bottom 18%, then y 0.45–0.95 — on the
 * last two pages of whatever was uploaded. On the Scott Noble order page 19 is
 * solid catalog and page 20 is catalog down to two thirds, so that window was
 * pointed at thirty rows of printed product lines. OCR duly read them, and the
 * operator was handed SIXTY-FIVE write-ins with names like
 * `[Grocery Low "3540002845 [HOW BOAT PORKN BEANS 280 sa39` to accept or
 * reject, burying the five real ones.
 *
 * The form prints its own answer: a heading that reads WRITE IN ITEMS, in clean
 * bold capitals, directly above the block. Printed type is the one thing OCR is
 * reliable at here, so that heading is what we look for — on the real order it
 * is found at y 0.584 of page 20 and on no other page, which is exactly right.
 *
 * If the heading is not found, this page has no write-ins as far as we are
 * concerned. Missing a handwritten line is recoverable — the operator is told
 * to check the paper. Inventing sixty-five is not.
 */
async function findWriteInBlock(canvas: HTMLCanvasElement): Promise<{ y0: number; y1: number } | null> {
  const w = canvas.width, h = canvas.height;
  // The heading always sits below the catalog, and searching the whole page
  // costs time on every page of every order for nothing.
  const search = {
    x0: Math.floor(w * 0.12), y0: Math.floor(h * 0.20),
    x1: Math.floor(w * 0.80), y1: Math.floor(h * 0.98),
  };
  const words = await ocrWords(canvas, search);
  if (!words.length) return null;

  let headerY: number | null = null;
  for (let i = 0; i < words.length; i++) {
    const t = words[i].text.replace(/[^A-Za-z-]/g, '').toUpperCase();
    if (t === 'WRITE' || t === 'WRITEIN' || t === 'WRITE-IN') {
      // "WRITE" on its own is a common misread inside a product name; require
      // the rest of the heading nearby to accept it.
      const near = words.slice(i + 1, i + 4)
        .map(x => x.text.replace(/[^A-Za-z]/g, '').toUpperCase());
      if (t !== 'WRITE' || near.includes('IN') || near.includes('ITEMS') || near.includes('ITEM')) {
        headerY = words[i].y1;
        break;
      }
    }
  }
  if (headerY == null) return null;

  // From just under the heading to the last rule of the table — not to the
  // bottom of the paper, which is where the page footer lives.
  const bands = findRowBands(canvas);
  const bottom = bands.length ? bands[bands.length - 1].y1 : Math.floor(h * 0.93);
  const y0 = Math.min(headerY + 2, Math.floor(h * 0.95));
  if (bottom - y0 < h * 0.03) return null;
  return { y0, y1: bottom };
}

/**
 * A printed catalog row that OCR has mangled, rather than something a person
 * wrote in.
 *
 * Belt and braces behind findWriteInBlock: even pointed at the right place, one
 * stray row of print above the header would otherwise become an item on the
 * order. Every printed row on this form carries a UPC, and no one hand-writes a
 * six-digit number in the description column.
 */
function looksPrinted(line: string): boolean {
  if (/\d{6,}/.test(line)) return true;
  if (/grocery\s*[-–—]?\s*low/i.test(line)) return true;
  if (/write\s*in\s*items?/i.test(line)) return true;
  if (/page\s*\d+\s*of\s*\d+/i.test(line)) return true;
  return false;
}

async function extractWriteIns(
  canvas: HTMLCanvasElement,
  pageIndex: number,
  catalog: CatalogItem[],
  byUpc: Map<string, CatalogItem>,
): Promise<WriteInCandidate[]> {
  const w = canvas.width;
  const h = canvas.height;
  const block = await findWriteInBlock(canvas);
  // No block on this page — and that is the normal case. Reading a window of
  // catalog rows "just in case" is what produced sixty-five imaginary items.
  if (!block) return [];

  const pad = Math.round((block.y1 - block.y0) * 0.02);
  const region = {
    x0: Math.floor(w * 0.16),
    y0: Math.max(0, block.y0 - pad),
    x1: Math.floor(w * 0.86),
    y1: Math.min(h, block.y1 + pad),
  };
  const crop = cropDataUrl(canvas, region);
  // The same block again, drawn large. OCR reads the small one; a person
  // deciding what "Vegetarian" means needs to see the handwriting.
  const contextCrop_ = contextCrop(canvas, region, null);
  const text = await ocrImage(crop);
  if (!text) return [];

  const lines = parseWriteInLines(text).filter(l => !looksPrinted(l.raw));
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
  /**
   * Which pages came from a camera, one flag per canvas.
   *
   * ⚠️ A PDF PAGE CANNOT BE PERSPECTIVE-DISTORTED. It is rendered from vector
   * or from a flatbed image by pdf.js, so its columns are vertical by
   * construction and there is nothing for the rectifier to correct.
   *
   * Without this the scanner was guessing, and guessing wrong: it decided 11
   * pages of a clean 20-page scan had been "photographed at an angle", warped
   * them, then marked the quantity column untrustworthy — which flagged all 116
   * marks for review and made the feature useless on the one input it was
   * built for. Knowing the source removes the guess entirely.
   */
  isPhoto?: boolean[];
  layoutItems: FormLayoutItem[];
  catalog: CatalogItem[];
  /**
   * Read the WRITE-IN BLOCK at the bottom of the last pages with OCR.
   *
   * It does not touch the quantity cells any more — see the note in the row
   * loop for what that measured. On the write-in lines it still earns its keep:
   * they are whole words on a clear stretch of paper, and "Pilbury frozen
   * Biscuit 4 Case" coming back close enough to match the catalog is worth far
   * more than the odd misread letter.
   */
  runOcr?: boolean;
  onProgress?: (p: ScanProgress) => void;
}): Promise<ScanResult> {
  const { canvases, layoutItems, catalog, runOcr = true, onProgress, isPhoto = [] } = opts;
  const indexes = buildCatalogIndexes(catalog);
  const candidates: ScanCandidate[] = [];
  const writeIns: WriteInCandidate[] = [];
  let rectified = 0;
  const pageOrientations: Array<0 | 90 | 180 | 270> = [];
  const summaryFlags: string[] = [];
  let layoutCursor = 0;

  const oriented: HTMLCanvasElement[] = [];
  for (let p = 0; p < canvases.length; p++) {
    onProgress?.({ phase: 'orient', page: p + 1, pages: canvases.length, message: `Straightening page ${p + 1} of ${canvases.length}…` });
    const { canvas: turned, rotation } = autoOrientCanvas(canvases[p]);

    // ⚠️ FLATTEN BEFORE ANYTHING MEASURES A POSITION.
    //
    // Rotation gets the page the right way up; it does nothing about a page
    // held at an angle to a phone lens. Every fraction used after this line —
    // the quantity column, the row bands, the write-in block — assumes the
    // table's columns are vertical and evenly placed, which is true of a
    // flatbed scan and false of a photograph. rectifyPage() finds the table's
    // own borders and maps them back to a rectangle, so a photo arrives here
    // looking like a scan and one code path serves both.
    //
    // It declines on anything already square, because warping a good scan only
    // costs it sharpness.
    // Photos only. A PDF page goes through untouched.
    const rect = isPhoto[p]
      ? rectifyPage(turned)
      : { canvas: turned, applied: false, skewBefore: 0 };
    const canvas = rect.canvas;
    // ⚠️ HAND THE MEMORY BACK AS WE GO.
    //
    // Orientation and rectification each produce a NEW canvas; without this the
    // originals stay alive until the whole scan finishes and the page count
    // multiplies straight into the canvas cap. Only the canvas actually being
    // measured needs to exist.
    if (turned !== canvases[p]) releaseCanvas(canvases[p]);
    if (canvas !== turned) releaseCanvas(turned);
    if (rect.applied) {
      rectified++;
      onProgress?.({ phase: 'orient', page: p + 1, pages: canvases.length,
        message: `Flattening page ${p + 1} — the photo was at an angle…` });
    }
    oriented.push(canvas);
    pageOrientations.push(rotation);
    if (rotation !== 0) summaryFlags.push(`Page ${p + 1} was rotated ${rotation}° automatically.`);
  }


  // ⚠️ CALIBRATE AFTER ORIENTING, NEVER BEFORE.
  // A page that is still upside down puts the Category column where the
  // quantity column belongs, and calibrating on that would lock the whole
  // document onto the wrong stripe.
  const qntyCol = calibrateQntyColumn(oriented, canvases.some((_, i) => isPhoto[i]));
  onProgress?.({ phase: 'detect', page: 0, pages: oriented.length,
    message: qntyCol.confident
      ? `Found the quantity column (${Math.round(qntyCol.lo * 100)}–${Math.round(qntyCol.hi * 100)}% across)…`
      : 'Could not lock onto the quantity column — every row will need checking…' });
  if (!qntyCol.confident) {
    summaryFlags.push(
      qntyCol.skew > 0.015
        ? 'These look like photos rather than a flat scan — the page leans, so the quantity column '
          + 'could not be located reliably. Marks below may be off by a column: check each one against '
          + 'its crop, and lay the form flat for a straight-on shot if you can.'
        : 'The quantity column could not be located on these pages, so a standard position was used. '
          + 'Check each mark against its crop before applying.',
    );
  }
  for (let p = 0; p < oriented.length; p++) {
    onProgress?.({ phase: 'detect', page: p + 1, pages: oriented.length, message: `Reading quantities on page ${p + 1} of ${oriented.length}…` });
    const { bands, marked, unplaced } = detectInkedRowsOnPage(oriented[p], qntyCol);
    /**
     * ⚠️ A MARK THAT CANNOT BE TIED TO A ROW CANNOT BE TIED TO A PRODUCT, SO IT
     * IS DROPPED — AND THE OPERATOR IS TOLD IT WAS.
     *
     * Adding it anyway would mean a quantity against no item, which is worse
     * than nothing. Saying nothing is worse still: the order would go out short
     * and the only clue would be on the paper.
     */
    if (unplaced > 0) {
      summaryFlags.push(
        `Page ${p + 1}: ${unplaced} mark${unplaced === 1 ? '' : 's'} could not be lined up with a `
        + 'row and were left out. Check that page against the paper before you send it.',
      );
    }
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

      /**
       * ⚠️ NO OCR ON QUANTITY CELLS. THIS WAS MEASURED, NOT ASSUMED.
       *
       * Forty-nine marks were cut out of the Scott Noble order at 300 dpi,
       * isolated from the printed rules, upscaled and put through Tesseract in
       * seven configurations — single character and single line, digit
       * whitelist on and off, four page-segmentation modes. The best read 5 of
       * 41 digits, left 35 blank and got 1 wrong. The looped "2" that hand
       * writes, which is more than half of every order, came back as "a",
       * "tat", "rag" or nothing — never as a 2.
       *
       * Five right out of forty-one is not help; it is a wrong number sitting
       * in a box that looks filled in. What replaced it is the thing that does
       * work: the marks are grouped by shape below, a person says what one
       * group is, and every mark in it takes that answer.
       */
      const ocrText: string | null = null;
      const qty: number | null = null;
      const note: string | null = null;
      const rowFlags = [...flags];
      /**
       * ⚠️ AN UNTRUSTED COLUMN IS A PAGE FACT, NOT A ROW FACT.
       *
       * This used to push "quantity column position is uncertain" onto every
       * row, and since any flag sends a row to the needs-you panel, a set of
       * phone photos put the ENTIRE order in there — bypassing the keypad step
       * on exactly the scans where a person most wants it, and burying the two
       * or three rows with a real problem. The warning belongs in the summary,
       * where it already is, and every mark is shown in its own row context
       * anyway.
       */

      // ⚠️ A MARK WITHOUT A NUMBER IS NOT A PROBLEM, IT IS THE NORMAL CASE.
      //
      // Every quantity is now answered by a person in the Quantities step, so
      // flagging "could not read a quantity" would flag all forty of them and
      // bury the handful — an unmatched item, a word instead of a number — that
      // genuinely need thinking about.
      // ⚠️ ROTATION IS A PAGE FACT, NOT A ROW FACT.
      //
      // This used to be pushed onto every row, and since a row with any flag at
      // all counts as needing a human, one upside-down page turned all forty of
      // its rows into "needs you". A scan of twenty pages off a phone is
      // routinely rotated; the panel that exists to isolate four uncertain
      // marks would have contained the entire order. It belongs in the summary,
      // once, where it was already useful.

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
        // Same reasoning as the flag above: no quantity is only a red flag if
        // something tried to read one.
        confidence,
        flags: rowFlags,
        disagreement,
        suggestedQty: qty,
        markNote: note,
        ocrText,
        orientationApplied: pageOrientations[p],
        ocrAttempted: false,
        contextCropDataUrl: hit.contextCropDataUrl,
        contextRegion: hit.contextRegion,
        markRegion: hit.markRegion,
        markImageDataUrl: hit.markImageDataUrl,
        shape: hit.shape,
        groupId: -1,
      });
    }
  }

  /**
   * GROUP THE MARKS THAT ARE THE SAME DIGIT.
   *
   * One hand wrote every quantity on this order, and it writes a 2 the same way
   * all forty times. Two pictures of the same digit can be matched to each other
   * far more surely than either can be recognised — so instead of guessing at
   * numbers, marks that look alike are put together and a person answers each
   * set once.
   *
   * Measured on the Scott Noble order: 49 marks, 34 sets, and no set containing
   * two different numbers.
   */
  onProgress?.({ phase: 'detect', page: oriented.length, pages: oriented.length,
    message: `Matching ${candidates.length} marks against each other…` });
  const markGroups = groupMarks(candidates.map(c => c.shape));
  markGroups.forEach((g, gi) => { for (const m of g.members) candidates[m].groupId = gi; });

  // Write-in / COD block on the last 1–2 pages (Scott Noble–class forms).
  /**
   * The last few pages are OFFERED to the write-in reader; it decides. Pages
   * without a WRITE IN ITEMS block return nothing, so looking at three costs a
   * row-band pass each and cannot invent items the way the old fixed window
   * did.
   */
  const writeInPages: number[] = [];
  for (let i = Math.max(0, oriented.length - 3); i < oriented.length; i++) writeInPages.push(i);
  for (const pi of runOcr ? writeInPages : []) {
    onProgress?.({ phase: 'writeins', page: pi + 1, pages: oriented.length, message: `Looking for write-ins on page ${pi + 1}…` });
    const found = await extractWriteIns(oriented[pi], pi, catalog, indexes.byUpc);
    /**
     * ⚠️ A FLOOD IS A BUG, NOT AN ORDER.
     *
     * Nobody hand-writes twenty-five extra items at the bottom of a form. If
     * this many come back, the block was misread — say so once and keep the
     * page out of the review screen rather than handing someone a list they
     * will scroll past and stop trusting.
     */
    if (found.length > 25) {
      summaryFlags.push(
        `Page ${pi + 1} looked like it had ${found.length} handwritten lines at the bottom, which `
        + 'is almost certainly a misread — they have been left out. Check the paper for write-ins.',
      );
      continue;
    }
    writeIns.push(...found);
  }
  if (runOcr && !writeIns.length) {
    // ⚠️ SAY THE BLOCK WAS NOT FOUND RATHER THAN SAYING NOTHING.
    //
    // This step now declines to guess where the write-in block is, which means
    // "no write-ins" can equally mean "there were none" or "the heading did not
    // read". Those need the same thing from the operator — a glance at the
    // bottom of the paper — and a silent nothing does not ask for it.
    summaryFlags.push(
      'No WRITE IN ITEMS block was found on the last pages. If anything is hand-written at the '
      + 'bottom of the form, add it with Quick add — it has not been picked up.',
    );
  }
  if (!runOcr) {
    // Switched off, so say what is not being looked at rather than letting the
    // write-in block quietly go missing from the order.
    summaryFlags.push(
      'Write-in reading is off — anything handwritten at the bottom of the last pages was not '
      + 'picked up. Check the paper before you send this.',
    );
  }
  if (rectified) {
    summaryFlags.push(
      `Flattened ${rectified} page${rectified === 1 ? '' : 's'} that were photographed at an angle.`,
    );
  }
  const rotated = pageOrientations
    .map((r, i) => ({ r, page: i + 1 }))
    .filter(x => x.r !== 0);
  if (rotated.length) {
    summaryFlags.push(
      `Straightened ${rotated.length} page${rotated.length === 1 ? '' : 's'} ` +
      `(${rotated.map(x => `p${x.page} ${x.r}°`).join(', ')}).`,
    );
  }
  if (writeIns.length) summaryFlags.push(`Found ${writeIns.length} write-in line${writeIns.length === 1 ? '' : 's'} on the last page(s).`);
  if (candidates.some(c => c.confidence === 'needs_review' || !c.match)) {
    summaryFlags.push('Some rows need a human look — they’re highlighted below.');
  }

  onProgress?.({ phase: 'done', page: oriented.length, pages: oriented.length, message: 'Ready for your review' });
  return { qntyColumn: qntyCol, candidates, markGroups, writeIns, pageOrientations, summaryFlags };
}
