// src/lib/paper-form-marks.ts
//
// Reading the quantity written in a cell of the Sinclair form.
//
// ⚠️ OCR DOES NOT READ THIS HANDWRITING. MEASURED, NOT ASSUMED.
//
// Forty-nine real marks were cut out of the Scott Noble order at 300 dpi,
// isolated from the printed rules, upscaled, and put through Tesseract in seven
// configurations — single character and single line, with and without a digit
// whitelist, at four page-segmentation modes. The best of them read 5 of 41
// digits correctly, left 35 blank, and got 1 wrong. The looped "2" that hand
// writes — more than half of every order — came back as "a", "tat", "rag" or
// nothing at all, never as a 2.
//
// So nothing in here guesses a number. What it does instead is the thing that
// IS reliable: the same hand writes the same digit the same way, forty times on
// one order, and two pictures of the same digit can be matched to each other far
// more surely than either can be recognised. Marks are isolated, normalised and
// grouped by shape; a person says what one of them is; every mark grouped with
// it takes the same answer.
//
// The grouping threshold below is not a guess either. On the Scott Noble order
// it puts 49 marks into 35 groups and NO group contains two different numbers.
// Loosening it to 0.7 saves four more groups and starts mixing a 3 into the 2s,
// which is exactly the failure that puts the wrong food on a boat, so it stays
// where it is.

/** Ink grid side used for shape comparison. */
const BOX = 28;
const PAD = 6;
export const G = BOX + 2 * PAD; // 40

/** Search ±3px when matching two marks — pen placement varies by about that. */
const SHIFT = 3;
/** Cost charged for ink pushed off the grid by a shift. */
const OFF_GRID = 6;
/**
 * Tall-and-thin vs round matters more than pixel overlap suggests: a "1" and a
 * "0" can score well on stroke distance alone. Measured weight.
 */
const ASPECT_WEIGHT = 0.8;

/**
 * Same digit, same hand.
 *
 * ⚠️ THIS NUMBER WAS MEASURED FOUR TIMES, AT FOUR RESOLUTIONS, AND THE LOWEST
 * ONE WINS.
 *
 * The forty-nine marks on the Scott Noble order were re-cut at 94, 150, 200 and
 * 300 dpi — the span between what a twenty-page PDF is rendered at on a phone
 * and what a close photograph gives — and grouped at every threshold from 0.45
 * to 0.70. At 0.55 the sets hold together at 94, 200 and 300 dpi with NO set
 * containing two different numbers. Going to 0.65 saves five more taps and
 * starts folding a 3 in with the 2s, which is the failure that puts the wrong
 * food on a boat.
 *
 * At 150 dpi one badly clipped 2 still lands with a 3 even here, which is why
 * every member of a set is shown as a picture next to the keypad and can be
 * tapped out of it. The threshold buys most of the speed; the pictures are what
 * make it safe.
 */
export const GROUP_THRESHOLD = 0.55;
/**
 * "These look like it too" — offered to a person WITH the pictures, never
 * applied on its own. Wrong often enough at this distance that it would be
 * indefensible unattended, and cheap to correct when someone is looking.
 */
export const SUGGEST_THRESHOLD = 0.85;
/**
 * …and of those, the ones close enough to arrive already ticked. Further than
 * this the operator opts in rather than opting out, because an offer that is
 * usually wrong costs more to refuse than it saves.
 */
export const PRETICK_THRESHOLD = 0.7;

export interface MarkShape {
  /** Normalised ink, G×G, 1 = ink. */
  grid: Uint8Array;
  /** Distance to the nearest ink pixel, same grid. */
  dt: Float32Array;
  /** Width / height of the mark before normalising. */
  aspect: number;
  /** Ink pixels after normalising — a blank cell has none. */
  ink: number;
  /** Separate strokes: one for most digits, more for "18" or "Case". */
  components: number;
  /** Coarse 12×12 signature, for cheaply skipping hopeless pairs. */
  coarse: Uint8Array;
}

export interface IsolatedMark {
  shape: MarkShape;
  /** Where the mark actually is, in canvas pixels. */
  box: { x0: number; y0: number; x1: number; y1: number };
}

export interface Rect { x0: number; y0: number; x1: number; y1: number }

/* ------------------------------------------------------------------ */
/* isolation                                                           */
/* ------------------------------------------------------------------ */

function otsu(hist: Float64Array, total: number): number {
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0, wB = 0, best = -1, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; thr = t; }
  }
  return thr;
}

/**
 * Cut one mark out of its cell: threshold, delete the printed rules, keep the
 * strokes that belong to this row, and hand back a tight box.
 *
 * ⚠️ THE RULES ARE DELETED WHEREVER THEY ARE, NOT JUST AT THE EDGES.
 *
 * An earlier version only trimmed ink off the outside of the crop, which left
 * the cell's own box intact around the digit — and a digit inside a rectangle is
 * what OCR and shape matching both choke on. A row or column that is ink nearly
 * all the way across is a printed rule and is removed outright; a pen stroke is
 * never that continuous.
 */
export function isolateMark(canvas: HTMLCanvasElement, rect: Rect, runY?: { y0: number; y1: number }): IsolatedMark | null {
  const rx0 = Math.max(0, Math.floor(rect.x0));
  const ry0 = Math.max(0, Math.floor(rect.y0));
  const rx1 = Math.min(canvas.width, Math.ceil(rect.x1));
  const ry1 = Math.min(canvas.height, Math.ceil(rect.y1));
  const w = rx1 - rx0, h = ry1 - ry0;
  if (w < 6 || h < 6) return null;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { data } = ctx.getImageData(rx0, ry0, w, h);

  const lum = new Uint8Array(w * h);
  const hist = new Float64Array(256);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = (data[i] + data[i + 1] + data[i + 2]) / 3 | 0;
    lum[p] = v;
    hist[v]++;
  }
  // Clamped: a cell holding nothing but paper produces a meaningless Otsu split
  // somewhere in the noise, and every speck of grain becomes "ink".
  const thr = Math.max(95, Math.min(195, otsu(hist, w * h)));

  const ink = new Uint8Array(w * h);
  for (let p = 0; p < lum.length; p++) ink[p] = lum[p] < thr ? 1 : 0;

  // Printed rules.
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += ink[y * w + x];
    if (n > w * 0.72) for (let x = 0; x < w; x++) ink[y * w + x] = 0;
  }
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) n += ink[y * w + x];
    if (n > h * 0.72) for (let y = 0; y < h; y++) ink[y * w + x] = 0;
  }

  // Connected strokes.
  const label = new Int32Array(w * h).fill(-1);
  const comps: Array<{ n: number; x0: number; y0: number; x1: number; y1: number }> = [];
  const stack: number[] = [];
  for (let p = 0; p < ink.length; p++) {
    if (!ink[p] || label[p] >= 0) continue;
    const k = comps.length;
    const c = { n: 0, x0: w, y0: h, x1: -1, y1: -1 };
    stack.length = 0; stack.push(p); label[p] = k;
    while (stack.length) {
      const q = stack.pop()!;
      const qy = (q / w) | 0, qx = q - qy * w;
      c.n++;
      if (qx < c.x0) c.x0 = qx;
      if (qx > c.x1) c.x1 = qx;
      if (qy < c.y0) c.y0 = qy;
      if (qy > c.y1) c.y1 = qy;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const ny = qy + dy, nx = qx + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
          const r = ny * w + nx;
          if (ink[r] && label[r] < 0) { label[r] = k; stack.push(r); }
        }
      }
    }
    comps.push(c);
  }
  if (!comps.length) return null;

  const minPx = Math.max(18, Math.round(w * h * 0.0012));
  let keep = comps
    .map((c, k) => ({ c, k }))
    .filter(({ c }) => c.n >= minPx);
  if (!keep.length) return null;

  /**
   * ⚠️ THE MARK ABOVE DROPS ITS TAIL INTO THIS CELL.
   *
   * The rows on this form are tighter than the handwriting, so the bottom of the
   * previous row's digit and the top of the next one routinely cross the rule.
   * Anything whose middle sits outside the central band of the crop belongs to a
   * neighbour, and letting it in makes the shape a blend of two marks — which
   * both breaks the grouping and shows the operator a picture of two numbers.
   */
  const lo = runY ? runY.y0 - ry0 : h * 0.15;
  const hi = runY ? runY.y1 - ry0 : h * 0.85;
  const central = keep.filter(({ c }) => {
    const mid = (c.y0 + c.y1) / 2;
    return mid > Math.min(lo, h * 0.15) && mid < Math.max(hi, h * 0.85);
  });
  if (central.length) keep = central;

  // And it is the biggest thing in the cell; specks are grain or a stray dot.
  const big = keep.reduce((m, { c }) => Math.max(m, c.n), 0);
  keep = keep.filter(({ c }) => c.n >= big * 0.18);

  const keys = new Set(keep.map(({ k }) => k));
  let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
  for (const { c } of keep) {
    if (c.x0 < bx0) bx0 = c.x0;
    if (c.y0 < by0) by0 = c.y0;
    if (c.x1 > bx1) bx1 = c.x1;
    if (c.y1 > by1) by1 = c.y1;
  }
  const tw = bx1 - bx0 + 1, th = by1 - by0 + 1;
  if (tw < 4 || th < 5) return null;

  const tight = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const p = (y + by0) * w + (x + bx0);
      if (ink[p] && keys.has(label[p])) tight[y * tw + x] = 1;
    }
  }

  const shape = normalise(tight, tw, th, keep.length);
  if (!shape) return null;
  return {
    shape,
    box: { x0: rx0 + bx0, y0: ry0 + by0, x1: rx0 + bx1 + 1, y1: ry0 + by1 + 1 },
  };
}

/** Scale to a fixed box keeping the proportions, then centre on the ink. */
function normalise(tight: Uint8Array, tw: number, th: number, components: number): MarkShape | null {
  const sc = BOX / Math.max(tw, th);
  const nw = Math.max(2, Math.round(tw * sc));
  const nh = Math.max(2, Math.round(th * sc));

  /**
   * ⚠️ AREA-WEIGHTED, NOT NEAREST PIXEL.
   *
   * Assigning each source pixel to whichever target cell its corner lands in
   * costs about five groups on a real order — a stroke one pixel wide lands on
   * one side of a boundary in one mark and the other side in the next, and two
   * pictures of the same digit stop matching. Weighting by how much of the cell
   * the ink actually covers, and keeping a cell that is at least half covered,
   * measured 34 groups with nothing mixed; the cheap version measured 41.
   */
  const sy = th / nh, sx = tw / nw;
  const bits = new Uint8Array(nw * nh);
  let cy = 0, cx = 0, n = 0;
  for (let ty = 0; ty < nh; ty++) {
    const y0 = ty * sy, y1 = y0 + sy;
    const iy0 = Math.floor(y0), iy1 = Math.min(th, Math.ceil(y1));
    for (let tx = 0; tx < nw; tx++) {
      const x0 = tx * sx, x1 = x0 + sx;
      const ix0 = Math.floor(x0), ix1 = Math.min(tw, Math.ceil(x1));
      let acc = 0;
      for (let y = iy0; y < iy1; y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        for (let x = ix0; x < ix1; x++) {
          if (!tight[y * tw + x]) continue;
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx > 0) acc += wy * wx;
        }
      }
      if (acc / (sy * sx) >= 0.5) {
        bits[ty * nw + tx] = 1; cy += ty; cx += tx; n++;
      }
    }
  }
  if (n < 6) return null;
  cy /= n; cx /= n;

  const grid = new Uint8Array(G * G);
  let oy = Math.round(G / 2 - cy);
  let ox = Math.round(G / 2 - cx);
  oy = Math.max(0, Math.min(G - nh, oy));
  ox = Math.max(0, Math.min(G - nw, ox));
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      if (bits[y * nw + x]) grid[(y + oy) * G + (x + ox)] = 1;
    }
  }

  const coarse = new Uint8Array(12 * 12);
  for (let y = 0; y < G; y++) {
    const gy = Math.min(11, (y * 12 / G) | 0);
    for (let x = 0; x < G; x++) {
      if (grid[y * G + x]) coarse[gy * 12 + Math.min(11, (x * 12 / G) | 0)] = 1;
    }
  }

  return { grid, dt: distanceTransform(grid), aspect: tw / th, ink: n, components, coarse };
}

/**
 * Distance to the nearest ink pixel, two-pass chamfer (3–4 mask / 3).
 * Exact Euclidean would cost more and change nothing at this size.
 */
function distanceTransform(grid: Uint8Array): Float32Array {
  const INF = 1e6;
  const d = new Float32Array(G * G);
  for (let i = 0; i < d.length; i++) d[i] = grid[i] ? 0 : INF;
  const put = (i: number, v: number) => { if (v < d[i]) d[i] = v; };
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const i = y * G + x;
      if (y > 0) put(i, d[i - G] + 3);
      if (y > 0 && x > 0) put(i, d[i - G - 1] + 4);
      if (y > 0 && x < G - 1) put(i, d[i - G + 1] + 4);
      if (x > 0) put(i, d[i - 1] + 3);
    }
  }
  for (let y = G - 1; y >= 0; y--) {
    for (let x = G - 1; x >= 0; x--) {
      const i = y * G + x;
      if (y < G - 1) put(i, d[i + G] + 3);
      if (y < G - 1 && x < G - 1) put(i, d[i + G + 1] + 4);
      if (y < G - 1 && x > 0) put(i, d[i + G - 1] + 4);
      if (x < G - 1) put(i, d[i + 1] + 3);
    }
  }
  for (let i = 0; i < d.length; i++) d[i] = Math.min(d[i], INF) / 3;
  return d;
}

/* ------------------------------------------------------------------ */
/* comparison                                                          */
/* ------------------------------------------------------------------ */

function oneWay(grid: Uint8Array, dt: Float32Array, dy: number, dx: number): number {
  let sum = 0, n = 0, off = 0;
  for (let y = 0; y < G; y++) {
    const ty = y + dy;
    for (let x = 0; x < G; x++) {
      if (!grid[y * G + x]) continue;
      n++;
      const tx = x + dx;
      if (ty < 0 || ty >= G || tx < 0 || tx >= G) { off++; continue; }
      sum += dt[ty * G + tx];
    }
  }
  if (!n) return 99;
  return (sum + off * OFF_GRID) / n;
}

/** Cheap reject: how much the 12×12 outlines disagree. */
function coarseDistance(a: MarkShape, b: MarkShape): number {
  let diff = 0;
  for (let i = 0; i < a.coarse.length; i++) if (a.coarse[i] !== b.coarse[i]) diff++;
  return diff / a.coarse.length;
}

/**
 * How unalike two marks are. Symmetric stroke distance over a small search for
 * placement, plus a penalty for a different shape of box.
 */
export function shapeDistance(a: MarkShape, b: MarkShape): number {
  if (coarseDistance(a, b) > 0.42) return 9;
  let best = Infinity;
  for (let dy = -SHIFT; dy <= SHIFT; dy++) {
    for (let dx = -SHIFT; dx <= SHIFT; dx++) {
      const d = 0.5 * (oneWay(a.grid, b.dt, dy, dx) + oneWay(b.grid, a.dt, -dy, -dx));
      if (d < best) best = d;
    }
  }
  const ra = Math.abs(Math.log(Math.max(a.aspect, 1e-3) / Math.max(b.aspect, 1e-3)));
  return best + ASPECT_WEIGHT * Math.min(ra, 2);
}

/* ------------------------------------------------------------------ */
/* grouping                                                            */
/* ------------------------------------------------------------------ */

export interface MarkGroup {
  /** Indexes into the array handed in. */
  members: number[];
  /** The member closest to the middle of the group — the one worth showing big. */
  representative: number;
}

/**
 * Put marks that are the same digit in the same hand together.
 *
 * Average linkage, because single linkage chains a 2 to a 3 through one badly
 * cut crop, and complete linkage splits a group over one member with a smudge.
 * Measured on the real order at 0.60: 35 groups, none mixed.
 */
export function groupMarks(shapes: Array<MarkShape | null>, threshold = GROUP_THRESHOLD): MarkGroup[] {
  const idx = shapes.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
  const n = idx.length;
  if (!n) return [];
  // A whole order is forty-odd marks. Six hundred means something has gone
  // wrong upstream, and a quadratic pass over it would freeze a phone; every
  // mark simply stands on its own rather than locking the tab.
  if (n > 600) return idx.map(i => ({ members: [i], representative: i }));

  const D = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = shapeDistance(shapes[idx[i]]!, shapes[idx[j]]!);
      D[i * n + j] = d; D[j * n + i] = d;
    }
  }

  /**
   * Average linkage, merged with the Lance–Williams update rather than by
   * re-measuring every member pair.
   *
   * ⚠️ THE NAIVE VERSION IS CUBIC AND THIS RUNS ON A PHONE. Recomputing the
   * mean over all member pairs at every merge is fine for the fifty marks on a
   * Sinclair order and lands somewhere near a billion operations if someone
   * ever scans a stack of them. The update below is exact — it is the same
   * average — and costs one pass per merge.
   *
   * Average rather than single or complete: single linkage chains a 2 to a 3
   * through one badly cut crop, complete linkage splits a set of 2s over the
   * one member with a smudge on it.
   */
  const members: number[][] = idx.map((_, i) => [i]);
  const alive: boolean[] = idx.map(() => true);
  const gd = new Float32Array(D); // group-to-group distance, seeded with pairs

  for (let merges = 0; merges < n - 1; merges++) {
    let bd = Infinity, bi = -1, bj = -1;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!alive[j]) continue;
        const d = gd[i * n + j];
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    if (bi < 0 || bd > threshold) break;
    const ni = members[bi].length, nj = members[bj].length;
    for (let k = 0; k < n; k++) {
      if (!alive[k] || k === bi || k === bj) continue;
      const v = (ni * gd[bi * n + k] + nj * gd[bj * n + k]) / (ni + nj);
      gd[bi * n + k] = v; gd[k * n + bi] = v;
    }
    members[bi] = members[bi].concat(members[bj]);
    alive[bj] = false;
  }

  const out: MarkGroup[] = [];
  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    const g = members[i];
    let rep = g[0], bestTotal = Infinity;
    for (const p of g) {
      let t = 0;
      for (const q of g) t += D[p * n + q];
      if (t < bestTotal) { bestTotal = t; rep = p; }
    }
    out.push({
      members: g.map(p => idx[p]).sort((a, b) => a - b),
      representative: idx[rep],
    });
  }
  return out.sort((a, b) => b.members.length - a.members.length);
}

/**
 * Marks that look like `shape` but were not close enough to group with it.
 * Offered to a person with the pictures in front of them, never applied alone.
 */
export function similarMarks(
  shape: MarkShape,
  shapes: Array<MarkShape | null>,
  exclude: Set<number>,
  threshold = SUGGEST_THRESHOLD,
): Array<{ index: number; distance: number }> {
  const out: Array<{ index: number; distance: number }> = [];
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    if (!s || exclude.has(i)) continue;
    const d = shapeDistance(shape, s);
    if (d <= threshold) out.push({ index: i, distance: d });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

/* ------------------------------------------------------------------ */
/* pictures                                                            */
/* ------------------------------------------------------------------ */

/**
 * The mark on its own, large, on white.
 *
 * ⚠️ THIS IS WHAT THE OPERATOR DECIDES FROM, so it is the real pixels — never
 * the binarised mask. Thresholding makes a faint pencil stroke look like a
 * confident one, and a decision made from a picture that flatters the ink is a
 * decision made on something that is not there.
 */
export function markImage(canvas: HTMLCanvasElement, box: Rect, targetHeight = 120): string {
  const padX = Math.max(4, Math.round((box.x1 - box.x0) * 0.18));
  const padY = Math.max(4, Math.round((box.y1 - box.y0) * 0.18));
  const x0 = Math.max(0, box.x0 - padX);
  const y0 = Math.max(0, box.y0 - padY);
  const x1 = Math.min(canvas.width, box.x1 + padX);
  const y1 = Math.min(canvas.height, box.y1 + padY);
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  const scale = Math.min(6, Math.max(1, targetHeight / h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, x0, y0, w, h, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
