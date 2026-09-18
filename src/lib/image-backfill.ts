// src/lib/image-backfill.ts
// Photo + proper-name backfill for catalog items the nightly UPC sync can't reach.
 // Department-gated name search + abbreviation scoring. Never writes description/freshop_id.

import {
  FRESHOP_APP_KEY, FRESHOP_STORE_ID, isAlcohol,
  type FreshopProduct,
} from '@/lib/freshop-sync';

const IMAGE_BASE = 'https://images.freshop.ncrcloud.com';

export const MIN_SCORE = 0.6;
export const NAME_SCORE = 0.85;

const CATEGORY_PATHS: Record<string, string[]> = {
  'Meat & Seafood': ['meat', 'seafood'],
  'Dairy': ['dairy'],
  'Produce': ['produce'],
  'Frozen Foods': ['frozen', 'frozen_foods'],
  'Bakery & Deli': ['bakery', 'deli', 'frozen_foods'],
  'Pantry & Grocery': ['pantry', 'frozen_foods', 'bakery', 'deli', 'dairy'],
  // Beverages includes frozen — frozen juice concentrate (MM OJ FRZ) lives
  // under frozen_foods on Sinclair's even though we file it under Beverages.
  'Beverages': ['pantry', 'beverages', 'frozen_foods'],
  'Snacks & Sweets': ['pantry', 'frozen_foods', 'bakery'],
  'Household & Cleaning': ['home_floral', 'home', 'floral'],
  'Health & Personal Care': ['health', 'personal_care', 'pantry'],
  // Stray pre-normalization labels — same targets as their standard equivalents.
  'Frozen Goods': ['frozen', 'frozen_foods'],
  'Dairy & Eggs': ['dairy'],
};

const CATEGORY_DEPTS: Record<string, string[]> = {
  'Meat & Seafood': ['1595064', '1595067'],           // Meat, Seafood
  'Dairy': ['1595060'],
  'Produce': ['1595066'],
  'Frozen Foods': ['1595062'],
  'Bakery & Deli': ['1595058', '1595061', '1595062'], // Bakery, Deli, Frozen
  'Pantry & Grocery': ['1595065', '1595062', '1595060'],
  'Beverages': ['1595065', '1595062'],
  'Snacks & Sweets': ['1595065', '1595058'],
  'Household & Cleaning': ['1595065'],                // real household goods live in Pantry
  'Health & Personal Care': ['1595065'],
  'Frozen Goods': ['1595062'],
  'Dairy & Eggs': ['1595060'],
};

function isRealPhoto(coverImage: string | undefined | null): boolean {
  const c = String(coverImage || '');
  return !!c && !c.startsWith('fp_dpt_generic/');
}

export function isSellable(p: FreshopProduct): boolean {
  return (p.status || 'available') === 'available';
}

const NOISE = new Set([
  'LB', 'LBS', 'OZ', 'CT', 'EA', 'EACH', 'PK', 'PKG', 'PACK', 'COUNT',
  'APPROX', 'ABOUT', 'SIZE', 'OUR', 'THE', 'AND', 'WITH', 'PER', 'IN',
  'OF', 'A', 'ZZZ',
  // POS packaging / filler that drowns brand+flavor search ("FL FAMILY SIZE LAYS")
  'FAMILY', 'XXL', 'XXVL', 'FS', 'DEC',
]);

function stripZzz(s: string): string {
  return s.replace(/\s*\(?\d+(\.\d+)?\s*zzz\)?/gi, '').trim();
}

const ABBREV: Record<string, string> = {
  // words
  HSBRWN: 'hash brown', HSHBRN: 'hash brown', PTY: 'patty', PTYS: 'patties',
  DNR: 'dinner', YST: 'yeast', RLS: 'rolls', RL: 'roll', FRZ: 'frozen',
  PEPPR: 'pepper', PPR: 'pepper', JALPENO: 'jalapeno', ASPRGS: 'asparagus',
  CHDR: 'cheddar', CHS: 'cheese', MLK: 'milk', BRD: 'bread', CHKN: 'chicken',
  CKN: 'chicken', SAUS: 'sausage', SASG: 'sausage', VEG: 'vegetable',
  SHRD: 'shredded', SLCD: 'sliced', BNLS: 'boneless', SKNLS: 'skinless',
  BRST: 'breast', THGH: 'thigh', GRND: 'ground', SMKD: 'smoked',
  CRM: 'cream', BTR: 'butter', SGR: 'sugar', FLR: 'flour', WHT: 'wheat',
  WHL: 'whole', CHOC: 'chocolate', VAN: 'vanilla', STRWBRY: 'strawberry',
  STRAW: 'strawberry', BLBRRY: 'blueberry', ORG: 'orange', LMNADE: 'lemonade',
  BEV: 'beverage', PZA: 'pizza', PEPP: 'pepperoni', SND: 'sandwich', BRGR: 'burger',
  NGT: 'nugget', CRNCH: 'crunch', ASPRG: 'asparagus', CUTS: 'cuts',
  GRM: 'german', FROST: 'frosting', RTS: 'frosting', // ready-to-spread frosting tubs
  SCO: 'sour cream onion',
  // brands / POS vendor codes (chips, cake mixes, frostings)
  FL: '', PRNGL: 'pringles', DH: 'duncan hines', PIL: 'pillsbury',
  AJ: 'pearl milling', // Aunt Jemima rebrand
  FUNYONS: 'funyuns', // Sinclair spells it Funyuns
  MM: 'minute maid', BC: 'best choice', BSTCH: 'best choice', KR: 'kraft',
  PF: 'prairie farms', HNZ: 'heinz', DELMNT: 'del monte', FLVRPAC: 'flavor pac',
};

const BRAND_HINTS = new Set([
  'LAYS', 'DORITOS', 'PRINGLES', 'FUNYUNS', 'FRITOS',
  'DUNCAN', 'HINES', 'PILLSBURY', 'PEARL', 'MILLING', 'QUAKER',
  'TOTINO', 'SCHUBERT', 'KRAFT', 'HEINZ', 'MINUTE', 'MAID',
]);

function deptPath(p: FreshopProduct): { top: string; sub: string } | null {
  const m = (p.canonical_url || '').match(/\/shop\/([^/]+)\/([^/]+)/);
  return m ? { top: m[1].toLowerCase(), sub: (m[2] || '').toLowerCase() } : null;
}

export function tokenize(name: string): string[] {
  const n = stripZzz(name)
    .toUpperCase()
    .replace(/\bA\s+J\b/g, 'AJ')                                   // "A J PLAIN CORN MEAL"
    .replace(/(\d+)\s*PERCENT/g, '$1%')                            // "80 Percent" → "80%"
    // Strip fluid ounces BEFORE the FL brand expand — "16 FL OZ" must not
    // become FRITO LAY (that put Chick-fil-A BBQ sauce on Lays BBQ chips).
    .replace(/\d+(\.\d+)?\s*FL\s*OZ\b/g, ' ')
    .replace(/~?\s*\d+(\.\d+)?\s*(LB|LBS|#|OZ|CT|EA)\b/g, ' ')     // "~5lb", "16 oz"
    .replace(/[^A-Z0-9%\s]/g, ' ');
  const raw = n.split(/\s+/).filter(t => t && !NOISE.has(t) && !/^\d+(\.\d+)?$/.test(t));
  // Expand abbreviations (may become multiple tokens: HSBRWN → HASH, BROWN)
  const out: string[] = [];
  for (const t of raw) {
    if (Object.prototype.hasOwnProperty.call(ABBREV, t)) {
      const exp = ABBREV[t];
      if (exp) out.push(...exp.toUpperCase().split(' ').filter(Boolean));
      // empty expansion = drop POS vendor code (FL)
    } else out.push(t);
  }
  return out;
}

function isSubsequence(short: string, long: string): boolean {
  if (!short || short.length > long.length) return false;
  if (short[0] !== long[0]) return false;
  let i = 0;
  for (const c of long) if (i < short.length && c === short[i]) i++;
  return i === short.length;
}

function tokenMatch(ours: string, theirs: string): number {
  if (ours === theirs) return 1;
  // Prefix match only when the shorter token is long enough — otherwise
  // FUNYUNS≈FUN (Lunchables Fun Pack) and SALTED≈S (Reese's) score as hits.
  const shorter = ours.length <= theirs.length ? ours : theirs;
  const longer = ours.length <= theirs.length ? theirs : ours;
  // LAY↔LAYS (gap 1) ok; FUN↔FUNYUNS (gap 4) not — stops Lunchables Fun Pack.
  if (shorter.length >= 3 && longer.startsWith(shorter) &&
      (shorter.length >= 4 || longer.length - shorter.length <= 2)) return 1;
  // BBQ ↔ barbecue/barbeque (full spelling has no Q, so subsequence fails)
  if ((ours === 'BBQ' && theirs.startsWith('BARBE')) ||
      (theirs === 'BBQ' && ours.startsWith('BARBE'))) return 0.9;
  if (isSubsequence(ours, theirs)) return 0.9;
  return 0;
}

export function scoreMatch(ourName: string, candidateName: string): number {
  const ours = tokenize(ourName);
  const theirs = tokenize(candidateName);
  if (!ours.length || !theirs.length) return 0;
  // Brand gate — if we named a brand, the candidate must carry it.
  const ourBrands = ours.filter(t => BRAND_HINTS.has(t));
  if (ourBrands.length) {
    const ok = ourBrands.some(b => theirs.some(c => tokenMatch(b, c) > 0));
    if (!ok) return 0;
  }
  let total = 0;
  for (const t of ours) {
    let best = 0;
    for (const c of theirs) best = Math.max(best, tokenMatch(t, c));
    total += best;
  }
  const verbosity = Math.max(0, theirs.length - ours.length);
  return (total / ours.length) * (1 - Math.min(0.25, verbosity * 0.03));
}

function sizeNum(s: string | null | undefined): string | null {
  const m = String(s ?? '').match(/(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

function cleanName(raw: string): string {
  return stripZzz(raw)
    .replace(/[,\s]+\d+(\.\d+)?\s*(oz|lb|lbs|ct|ea|each|pk|pack|g|kg|ml|l|fl\s*oz)\.?$/i, '')
    .replace(/[,\s]+$/, '')
    .trim();
}

export interface ImageCandidate {
  /** Sinclair's name, cleaned of trailing pack size. */
  proper_name: string;
  /** Verbatim Sinclair's listing name — shown in review so a human can judge. */
  freshop_name: string;
  image_url: string;
  score: number;
  dept_path: string;
  freshop_size: string | null;
  freshop_price: number | null;
  /** Confident enough to also rewrite the display name? */
  rename: boolean;
  /** Which signals corroborated — surfaced in the review UI. */
  size_match: boolean;
  price_match: boolean;
  /** Sinclair's own status for the matched listing ("available", "no_movement"). */
  status: string;
  /** Is Sinclair's actually selling this right now? */
  sellable: boolean;
  /** Freshop id of the row the PHOTO came from, when that differs from the
   *  row that established availability (see borrowed_photo). */
  image_freshop_id: string | null;
  /** True when the exact match had no real photograph and the image was taken
   *  from a same-department sibling ("P2 LIMES" has no photo; "Coast Tropical
   *  Limes, Persian" does). Availability NEVER comes from a sibling. */
  borrowed_photo: boolean;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function searchFreshop(term: string, departmentId?: string): Promise<FreshopProduct[] | null> {
  // department_id_cascade=true is REQUIRED — without it parent departments
  // (Pantry 1595065) return only items pinned directly to that node, not the
  // snack/chip/baking subtree where Lays, Pringles, Duncan Hines actually live.
  // Same lesson as freshop-sync fetchFreshopPage; Find Photos omitted it and
  // marked hundreds of real Sinclair SKUs "not on Sinclair's site".
  const url = `https://api.freshop.ncrcloud.com/1/products`
    + `?app_key=${FRESHOP_APP_KEY}&store_id=${FRESHOP_STORE_ID}`
    + (departmentId
      ? `&department_id=${encodeURIComponent(departmentId)}&department_id_cascade=true`
      : '')
    + `&q=${encodeURIComponent(term)}&limit=20`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data?.items) ? (data.items as FreshopProduct[]) : [];
      }
      // 429 / 5xx — back off and retry once before giving up.
      if (attempt === 0) { await sleep(1200); continue; }
    } catch {
      if (attempt === 0) { await sleep(1200); continue; }
    }
  }
  return null;
}

export async function findMatchFor(
  description: string,
  category: string,
  pkgSize: string | null,
  price: number | null,
): Promise<{ candidate: ImageCandidate | null; rateLimited: boolean }> {
  const allowedPaths = CATEGORY_PATHS[category];
  const depts = CATEGORY_DEPTS[category];
  if (!allowedPaths || !depts) return { candidate: null, rateLimited: false };

  const toks = tokenize(description);
  if (!toks.length) return { candidate: null, rateLimited: false };

  // Progressive relaxation: the full abbreviated name rarely hits Sinclair's
  // search, but its leading brand token usually does ("SCHUBERT" → all the
  // Sister Schubert's listings). Also try a trailing window so
  // "FRITO LAY LAYS BBQ" still searches "LAYS BBQ" when the Frito-Lay prefix
  // is too noisy for NCR's engine. Stop at the first term that yields a match.
  const widths = Array.from(new Set([toks.length, 3, 2, 1])).filter(n => n >= 1 && n <= toks.length);
  const terms: string[] = [];
  const seenTerm = new Set<string>();
  for (const n of widths) {
    for (const term of [toks.slice(0, n).join(' '), toks.slice(-n).join(' ')]) {
      if (!seenTerm.has(term)) { seenTerm.add(term); terms.push(term); }
    }
  }

  let paced = false;
  for (const term of terms) {

    // Search each candidate department separately — department_id ignores all
    // but the first value in a comma list, so a CSV would silently drop the rest.
    for (const deptId of depts) {
      if (paced) await sleep(200);                        // gentle pacing; NCR throttles bursts
      paced = true;
      const items = await searchFreshop(term, deptId);
      if (items === null) return { candidate: null, rateLimited: true };

      // Pass 1 — establish IDENTITY and AVAILABILITY. Strict: this is the row
      // that decides whether a crew is allowed to order the item at all, so a
      // real photo is NOT required here and never influences the decision.
      let best: ImageCandidate | null = null;
      let bestItem: FreshopProduct | null = null;
      for (const item of items) {
        if (isAlcohol(item)) continue;
        const path = deptPath(item);
        // The department_id filter already guarantees the department. A parsed
        // canonical_url is a bonus check, not a requirement — rejecting on a
        // flat AWG url here would discard correctly-scoped items for the shape
        // of their link.
        if (path && !allowedPaths.includes(path.top)) continue;

        const sizeMatch = !!sizeNum(pkgSize) && sizeNum(pkgSize) === sizeNum(item.size);
        const itemPrice = typeof item.base_price === 'number' ? item.base_price : null;
        const priceMatch = price != null && itemPrice != null && Math.abs(itemPrice - price) < 0.01;

        // Size/price agreement is strong corroboration that this is the same
        // product, so it lifts confidence toward the rename threshold.
        let score = scoreMatch(description, item.name || '');
        if (sizeMatch) score += 0.15;
        if (priceMatch) score += 0.15;
        score = Math.min(1, score);

        if (score < MIN_SCORE) continue;                  // confidence gate
        if (best && score <= best.score) continue;

        const real = isRealPhoto(item.cover_image);
        bestItem = item;
        best = {
          proper_name: cleanName(item.name || ''),
          freshop_name: stripZzz((item.name || '').trim()),
          image_url: real ? `${IMAGE_BASE}/${item.cover_image}_large.png` : '',
          score: Math.round(score * 100) / 100,
          dept_path: path ? `${path.top}/${path.sub}` : `dept:${deptId}`,
          freshop_size: item.size ? stripZzz(item.size) || null : null,
          freshop_price: itemPrice,
          rename: score >= NAME_SCORE && (sizeMatch || priceMatch),
          size_match: sizeMatch,
          price_match: priceMatch,
          status: item.status || 'available',
          sellable: isSellable(item),
          image_freshop_id: real && item.id != null ? String(item.id) : null,
          borrowed_photo: false,
        };
      }

      if (!best) continue;

      // Pass 2 — PHOTO ONLY. Sinclair's often has no photograph of their own
      // listing for loose produce and hand-cut meat ("P2 LIMES" carries the
      // generic icon) while a sibling in the same department does. A lime looks
      // like a lime, so borrowing that image is safe and far better than a grey
      // box — but it is cosmetic only and can never make an item orderable.
      if (!best.image_url) {
        let sib: { url: string; id: string | null; score: number } | null = null;
        for (const item of items) {
          if (item === bestItem || isAlcohol(item)) continue;
          if (!isRealPhoto(item.cover_image)) continue;
          const s = scoreMatch(description, item.name || '');
          if (s < NAME_SCORE) continue;                   // deliberately stricter than MIN_SCORE
          if (sib && s <= sib.score) continue;
          sib = {
            url: `${IMAGE_BASE}/${item.cover_image}_large.png`,
            id: item.id != null ? String(item.id) : null,
            score: s,
          };
        }
        if (sib) {
          best.image_url = sib.url;
          best.image_freshop_id = sib.id;
          best.borrowed_photo = true;
        }
      }

      return { candidate: best, rateLimited: false };
    }
  }

  return { candidate: null, rateLimited: false };
}
