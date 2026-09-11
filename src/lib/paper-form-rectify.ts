// src/lib/paper-form-rectify.ts
//
// FLATTEN A PHOTOGRAPH OF THE ORDER FORM INTO SOMETHING THAT READS LIKE A SCAN.
//
// ── WHY THIS HAS TO EXIST ────────────────────────────────────────────────
//
// Everything downstream locates the quantity column as a fraction of the
// page — the stripe at 64–69% across — and then measures ink inside it. That
// is exact on a flatbed scan and worthless on a phone photo, because a page
// held in one hand is rotated a few degrees and tilted away from the lens, so
// every column walks sideways as it goes down the page. A fixed vertical stripe
// cuts diagonally across the table.
//
// Measured on a simulated hand-held shot of a real Scott Noble page: the table
// spans x 0.211→0.907 at the top of the frame and 0.175→0.894 at the bottom.
// The quantity column is about 5% of the page wide. A stripe placed by page
// fraction misses it by more than its own width and lands on PACK SIZE — so the
// reader does not fail, it confidently reports pack sizes as quantities. That is
// the worst thing this feature could do, and no amount of care further down the
// pipeline can undo it.
//
// So the page is straightened first. Find the table's own borders, work out the
// quadrilateral it occupies in the photo, and map that quadrilateral back onto a
// rectangle. After that the columns are vertical, fractions mean what they say,
// and the scan path and the photo path are the same path.
//
// ── WHY THE BORDERS ARE FOUND BY RUN LENGTH ──────────────────────────────
//
// The obvious approach — "the first column with a lot of dark pixels" — finds
// printed text, because a column of text is also dark. The table's borders are
// distinguishable by being CONTINUOUS: a ruled line runs the whole height of a
// band, while even the densest column of type is broken every few pixels
// between one character and the next. Longest-unbroken-run separates them
// cleanly where total darkness does not.

/** A straight line through the page, as x = m·y + b. Near-vertical by design. */
interface VLine { m: number; b: number }

export interface RectifyResult {
  canvas: HTMLCanvasElement;
  /** True when the page was actually warped. */
  applied: boolean;
  /** How far the table leaned before correction, in page widths. */
  skewBefore: number;
  /** Why it was left alone, when it was. */
  reason?: string;
}

/** Work at this width when hunting for borders — full resolution buys nothing. */
const PROBE_WIDTH = 800;

function toGrayMask(canvas: HTMLCanvasElement, probeW: number): {
  mask: Uint8Array; w: number; h: number; scale: number;
} {
  const scale = Math.min(1, probeW / canvas.width);
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const small = document.createElement('canvas');
  small.width = w; small.height = h;
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, w, h);
  const { data } = sctx.getImageData(0, 0, w, h);

  const lum = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  // A threshold taken from the page's own histogram rather than a constant:
  // a photo under kitchen light and a photocopy have completely different
  // "white", and a fixed cut-off turns one of them into a solid black rectangle.
  const sorted = Uint8Array.from(lum).sort();
  const median = sorted[Math.floor(sorted.length * 0.55)];
  const thr = Math.max(40, median - 22);

  const mask = new Uint8Array(w * h);
  for (let p = 0; p < lum.length; p++) mask[p] = lum[p] < thr ? 1 : 0;
  return { mask, w, h, scale };
}

/**
 * The x of the table's border inside one horizontal band, or null.
 *
 * Scans every column for its longest unbroken vertical run of ink and takes the
 * outermost column whose run covers most of the band. Text cannot qualify: the
 * gaps between characters break it long before it reaches that length.
 */
function borderX(
  mask: Uint8Array, w: number, y0: number, y1: number, side: 'L' | 'R',
): number | null {
  const bandH = y1 - y0;
  if (bandH < 8) return null;
  const need = bandH * 0.75;

  const best = new Int32Array(w);
  const cur = new Int32Array(w);
  for (let y = y0; y < y1; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) {
        cur[x] += 1;
        if (cur[x] > best[x]) best[x] = cur[x];
      } else cur[x] = 0;
    }
  }
  if (side === 'L') {
    for (let x = 0; x < w; x++) if (best[x] > need) return x;
  } else {
    for (let x = w - 1; x >= 0; x--) if (best[x] > need) return x;
  }
  return null;
}

/** Least squares with one outlier-rejecting pass — a smudge shouldn't tilt it. */
function fitVLine(pts: Array<{ y: number; x: number }>): VLine | null {
  if (pts.length < 3) return null;
  const solve = (set: Array<{ y: number; x: number }>): VLine => {
    let sy = 0, sx = 0, syy = 0, sxy = 0;
    for (const p of set) { sy += p.y; sx += p.x; syy += p.y * p.y; sxy += p.x * p.y; }
    const n = set.length;
    const denom = n * syy - sy * sy;
    if (Math.abs(denom) < 1e-6) return { m: 0, b: sx / n };
    const m = (n * sxy - sy * sx) / denom;
    return { m, b: (sx - m * sy) / n };
  };
  const first = solve(pts);
  const res = pts.map(p => Math.abs(p.x - (first.m * p.y + first.b)));
  const mean = res.reduce((a, b) => a + b, 0) / res.length;
  const sd = Math.sqrt(res.reduce((a, b) => a + (b - mean) ** 2, 0) / res.length);
  const keep = pts.filter((_, i) => res[i] <= Math.max(4, mean + 2 * sd));
  return keep.length >= 3 ? solve(keep) : first;
}

/**
 * How far the table runs down the page, measured along a border it already found.
 *
 * ⚠️ NOT BY LOOKING FOR HORIZONTAL RULES. That was the first attempt and it
 * fails on exactly the input this file exists for: on a page rotated three
 * degrees a horizontal rule drifts into the next row of pixels every thirty
 * pixels across, so at any single y it is a short dash rather than a line.
 * Measured on the test photo, the longest horizontal run anywhere on the page
 * was under a quarter of the table's width — no threshold separates a rule from
 * a word.
 *
 * The side borders do not have that problem, because they were fitted as lines
 * across eight bands rather than found at one height. So the table's top and
 * bottom are read off the borders themselves: walk the fitted line and note
 * where there is ink beside it. The longest unbroken stretch is the table; a
 * stray pen mark higher up the page forms its own short run and is ignored.
 */
function lineExtent(
  mask: Uint8Array, w: number, h: number, line: VLine,
): { y0: number; y1: number } | null {
  const TOL = 3;
  const GAP = 6;          // a dashed or faded rule may skip a few pixels
  const runs: Array<{ y0: number; y1: number }> = [];
  let start: number | null = null, prev = -99;

  for (let y = 0; y < h; y++) {
    const x = Math.round(line.m * y + line.b);
    let hit = false;
    for (let dx = -TOL; dx <= TOL && !hit; dx++) {
      const xx = x + dx;
      if (xx >= 0 && xx < w && mask[y * w + xx]) hit = true;
    }
    if (!hit) continue;
    if (start === null) start = y;
    else if (y - prev > GAP) { runs.push({ y0: start, y1: prev }); start = y; }
    prev = y;
  }
  if (start !== null) runs.push({ y0: start, y1: prev });
  if (!runs.length) return null;
  return runs.reduce((a, b) => (b.y1 - b.y0 > a.y1 - a.y0 ? b : a));
}

/** Solve the 8 unknowns of a projective transform from 4 point pairs. */
function solveHomography(
  src: Array<[number, number]>, dst: Array<[number, number]>,
): number[] | null {
  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  // Gaussian elimination with partial pivoting.
  const n = 8;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-9) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    [B[col], B[piv]] = [B[piv], B[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      if (!f) continue;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      B[r] -= f * B[col];
    }
  }
  const hh: number[] = [];
  for (let i = 0; i < n; i++) hh.push(B[i] / A[i][i]);
  hh.push(1);
  return hh;
}

export function rectifyPage(canvas: HTMLCanvasElement): RectifyResult {
  const { mask, w, h, scale } = toGrayMask(canvas, PROBE_WIDTH);

  // Sample the side borders in eight horizontal bands and fit a line to each.
  // Eight is enough to average out a torn edge and few enough to stay quick.
  const BANDS = 8;
  const top = Math.floor(h * 0.13), bot = Math.floor(h * 0.90);
  const left: Array<{ y: number; x: number }> = [];
  const right: Array<{ y: number; x: number }> = [];
  for (let i = 0; i < BANDS; i++) {
    const y0 = Math.round(top + ((bot - top) * i) / BANDS);
    const y1 = Math.round(top + ((bot - top) * (i + 1)) / BANDS);
    const mid = (y0 + y1) / 2;
    const xl = borderX(mask, w, y0, y1, 'L');
    const xr = borderX(mask, w, y0, y1, 'R');
    if (xl != null) left.push({ y: mid, x: xl });
    if (xr != null) right.push({ y: mid, x: xr });
  }

  const lineL = fitVLine(left);
  const lineR = fitVLine(right);
  if (!lineL || !lineR) {
    return { canvas, applied: false, skewBefore: 0, reason: 'Could not find the table’s edges.' };
  }

  const xAt = (l: VLine, y: number) => l.m * y + l.b;
  const skewBefore = Math.abs(xAt(lineL, top) - xAt(lineL, bot)) / w;

  // Top and bottom, taken from the borders themselves. Where the two disagree
  // the tighter answer wins — better to crop a millimetre off the table than to
  // anchor the warp on a smudge outside it.
  const extL = lineExtent(mask, w, h, lineL);
  const extR = lineExtent(mask, w, h, lineR);
  if (!extL || !extR) {
    return { canvas, applied: false, skewBefore, reason: 'Could not find the top and bottom of the table.' };
  }
  const yTop = Math.max(extL.y0, extR.y0);
  const yBot = Math.min(extL.y1, extR.y1);
  if (yBot - yTop < h * 0.4) {
    return { canvas, applied: false, skewBefore, reason: 'The table does not fill enough of the page to flatten it.' };
  }

  // Already flat? Warping a good scan can only lose detail.
  if (skewBefore < 0.006) {
    return { canvas, applied: false, skewBefore, reason: 'Page is already square.' };
  }

  // The quadrilateral: the side lines evaluated at the top and bottom rules.
  const q: Array<[number, number]> = [
    [xAt(lineL, yTop) / scale, yTop / scale],
    [xAt(lineR, yTop) / scale, yTop / scale],
    [xAt(lineR, yBot) / scale, yBot / scale],
    [xAt(lineL, yBot) / scale, yBot / scale],
  ];

  // ⚠️ THE TABLE IS PUT BACK WHERE A SCAN WOULD HAVE PUT IT — 8% in from the
  // left, 87% across — instead of filling the output edge to edge. Every
  // fraction downstream was measured against a flatbed scan of this form, and
  // rectifying to a different frame would mean re-deriving all of them.
  const outW = canvas.width, outH = canvas.height;
  const mx0 = outW * 0.080, mx1 = outW * 0.868;
  const my0 = outH * 0.075, my1 = outH * 0.955;
  const dst: Array<[number, number]> = [[mx0, my0], [mx1, my0], [mx1, my1], [mx0, my1]];

  // Destination → source, so every output pixel can be filled exactly once.
  const hm = solveHomography(dst, q);
  if (!hm) return { canvas, applied: false, skewBefore, reason: 'Could not solve the page geometry.' };

  const srcCtx = canvas.getContext('2d', { willReadFrequently: true })!;
  const src = srcCtx.getImageData(0, 0, canvas.width, canvas.height);
  const out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  const octx = out.getContext('2d')!;
  const dstImg = octx.createImageData(outW, outH);
  const sd = src.data, dd = dstImg.data;
  const sw = canvas.width, sh = canvas.height;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const den = hm[6] * x + hm[7] * y + hm[8];
      const sx = (hm[0] * x + hm[1] * y + hm[2]) / den;
      const sy = (hm[3] * x + hm[4] * y + hm[5]) / den;
      const o = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        // Outside the photograph: paper white, not black. A black border would
        // read as ink to every detector downstream.
        dd[o] = dd[o + 1] = dd[o + 2] = 245; dd[o + 3] = 255;
        continue;
      }
      // Bilinear — the handwriting is going to OCR and nearest-neighbour
      // sampling puts stair-steps on every pencil stroke.
      const x0 = sx | 0, y0 = sy | 0;
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4;
      const i01 = i00 + sw * 4, i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        const a = sd[i00 + c] + (sd[i10 + c] - sd[i00 + c]) * fx;
        const b = sd[i01 + c] + (sd[i11 + c] - sd[i01 + c]) * fx;
        dd[o + c] = a + (b - a) * fy;
      }
      dd[o + 3] = 255;
    }
  }
  octx.putImageData(dstImg, 0, 0);
  return { canvas: out, applied: true, skewBefore };
}
