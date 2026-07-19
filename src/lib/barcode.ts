// src/lib/barcode.ts
// UPC-A barcode rendering for the pick sheet — deterministic encoding of the
// UPC digits we already sync from Sinclair's, producing the exact same bars
// that are printed on the product package (so the POS gun reads them the same).
//
// Verified against three ground-truth barcodes on Sinclair's own Freshop
// pick sheet (July 19, 2026):
//   UPC 7143000105 → "0 71430 00105 9"
//   UPC 7143000123 → "0 71430 00123 3"
//   UPC 2100064605 → "0 21000 64605 0"
//
// SAFETY RAILS:
//  - normalizeUpcA() returns null for anything that can't be cleanly encoded —
//    callers must render "no barcode" fallbacks, never a wrong barcode.
//  - isWeighableUpc() detects Sinclair's price-embedded scale items (leading 2,
//    five trailing zeros). Their catalog UPC would scan as $0.00 — the picker
//    must scan the package's own scale label instead. NEVER render a barcode
//    for these.

/** UPC-A check digit for an 11-digit payload. */
export function upcCheckDigit(d11: string): number {
  let odd = 0, even = 0;
  for (let i = 0; i < 11; i++) {
    const n = d11.charCodeAt(i) - 48;
    if (i % 2 === 0) odd += n; else even += n;
  }
  return (10 - ((odd * 3 + even) % 10)) % 10;
}

/**
 * Normalize a raw catalog UPC into a full 12-digit UPC-A (with check digit).
 * Returns null when the value can't be encoded confidently.
 */
export function normalizeUpcA(raw: string | null | undefined): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits || digits.length > 13) return null;
  if (digits.length === 13) {
    // EAN-13 form of a UPC-A (leading 0) — anything else isn't UPC-A.
    return digits.startsWith('0') ? normalizeUpcA(digits.slice(1)) : null;
  }
  if (digits.length === 12) {
    // Already has a check digit — only trust it if it verifies.
    return upcCheckDigit(digits.slice(0, 11)) === +digits[11] ? digits : null;
  }
  // 11 digits or fewer: left-pad with zeros (Freshop stores 10–11 digits), append check.
  const d11 = digits.padStart(11, '0');
  return d11 + upcCheckDigit(d11);
}

/**
 * Sinclair's weighable/scale items: price-embedded UPCs. The 11-digit catalog
 * form starts with 2 and ends in five zeros (e.g. salami 20529100000) — the
 * real scannable digits only exist on the package's scale label.
 */
export function isWeighableUpc(raw: string | null | undefined): boolean {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return false;
  const d11 = digits.length === 12 ? digits.slice(0, 11) : digits.padStart(11, '0');
  return d11.length === 11 && d11.startsWith('2') && d11.endsWith('00000');
}

// L-codes for digits 0–9 (left half). Right half is the bitwise complement.
const L_CODES = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];

/** Full 95-module UPC-A pattern: guard + 6 L digits + center + 6 R digits + guard. */
function upcModules(d12: string): string {
  let m = '101';
  for (let i = 0; i < 6; i++) m += L_CODES[d12.charCodeAt(i) - 48];
  m += '01010';
  for (let i = 6; i < 12; i++) {
    m += L_CODES[d12.charCodeAt(i) - 48].replace(/[01]/g, c => (c === '0' ? '1' : '0'));
  }
  return m + '101';
}

export interface UpcSvgOptions {
  /** Width of one module in SVG units (bar thinness). Default 2. */
  moduleWidth?: number;
  /** Bar height in SVG units. Default 60. */
  height?: number;
  /** Render the human-readable digits under the bars. Default true. */
  showDigits?: boolean;
}

/**
 * Render a 12-digit UPC-A as an SVG string (bars + human-readable digits,
 * matching the layout on Sinclair's Freshop printouts: "0 71430 00105 9").
 * Returns null if the input can't be normalized — callers show a fallback.
 */
export function upcASvg(raw: string | null | undefined, opts: UpcSvgOptions = {}): string | null {
  const d12 = normalizeUpcA(raw);
  if (!d12) return null;

  const mw = opts.moduleWidth ?? 2;
  const barH = opts.height ?? 60;
  const showDigits = opts.showDigits !== false;
  const quiet = 9 * mw;                 // quiet zone each side
  const fontSize = 7 * mw;
  const textH = showDigits ? fontSize + 2 : 0;
  const width = 95 * mw + quiet * 2;
  const height = barH + textH;

  // Guard bars + the outermost digit pairs extend to full height; the middle
  // bars stop short to leave room for the digits (standard UPC-A layout).
  const longRanges: Array<[number, number]> = [
    [0, 3],            // left guard
    [3, 10],           // first digit (printed outside on real labels; keep long)
    [45, 50],          // center guard
    [85, 92],          // last digit
    [92, 95],          // right guard
  ];
  const isLong = (i: number) => longRanges.some(([a, b]) => i >= a && i < b);
  const shortH = showDigits ? barH - fontSize : barH;

  const modules = upcModules(d12);
  let rects = '';
  for (let i = 0; i < 95; i++) {
    if (modules[i] !== '1') continue;
    // merge consecutive same-height bars
    const h = isLong(i) ? barH : shortH;
    let j = i;
    while (j + 1 < 95 && modules[j + 1] === '1' && (isLong(j + 1) ? barH : shortH) === h) j++;
    rects += `<rect x="${quiet + i * mw}" y="0" width="${(j - i + 1) * mw}" height="${h}"/>`;
    i = j;
  }

  let text = '';
  if (showDigits) {
    const y = barH + fontSize - 1;
    const groups: Array<[string, number, string]> = [
      [d12[0], quiet - 2, 'end'],                          // leading digit, left of bars
      [d12.slice(1, 6), quiet + 24 * mw, 'middle'],        // left block
      [d12.slice(6, 11), quiet + 71 * mw, 'middle'],       // right block
      [d12[11], quiet + 95 * mw + 2, 'start'],             // check digit, right of bars
    ];
    text = groups.map(([t, x, anchor]) =>
      `<text x="${x}" y="${y}" font-family="Menlo,Consolas,monospace" font-size="${fontSize}" text-anchor="${anchor}">${t}</text>`
    ).join('');
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="UPC ${d12}">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/>` +
    `<g fill="#000">${rects}${text}</g></svg>`;
}
