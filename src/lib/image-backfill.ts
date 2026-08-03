// src/lib/image-backfill.ts
//
// Photo + proper-name backfill for catalog items the nightly sync can't reach.
//
// THE PROBLEM. The nightly sync matches on UPC. Items with no UPC (hand-cut
// meat) or a UPC that doesn't line up with Sinclair's never match, so they
// keep the POS abbreviation from the original spreadsheet and never get a
// photo — "SCHUBERT DNR YST RLS", "TOTINO PEPP PIZZA ROLLS", "LIVER, BEEF".
// Sinclair's has both the photo and the real name; we just weren't asking.
//
// THE APPROACH. Search Sinclair's by name, then gate hard. Fuzzy matching on
// food is dangerous — a live probe of q="beef liver" returned:
//
//    /shop/meat/…      Skylark Beef Liver 16 oz        ← what we want
//    /shop/pantry/…    GRAVY TRAIN BEEF LIVER BACON    ← dog food
//    (flat AWG url)    FIELD TRIAL BEEF & LIVER        ← dog food
//
// Taking the top hit would have put dog food on the beef liver. Hence:
//
//   1. DEPARTMENT GATE — the candidate's canonical_url must carry a real
//      /shop/<dept>/<sub>/ path whose top segment maps to OUR category. This
//      alone rejects every pet-food hit. AWG items have flat URLs and can't be
//      verified, so they're rejected too: better no photo than a wrong one.
//   2. SCORE GATE — abbreviation-aware token match must clear MIN_SCORE.
//   3. IMAGE GATE — candidate must actually carry a cover image.
//
// ABBREVIATIONS. POS names drop vowels ("DNR" ← DINNER, "YST" ← YEAST, "RLS"
// ← ROLLS), which plain token overlap can't see. We treat a token as matching
// when it's an in-order SUBSEQUENCE of the candidate's token and shares its
// first letter — that resolves the whole family at a small confidence cost.
//
// WRITES. image_url always; details (the display name) ONLY at high confidence.
//   ⚠ products.description is NEVER touched — the paper order-form matcher
//     depends on the spreadsheet-style names, and rewriting them would unmatch
//     ~123 form rows on the next nightly sync.
//   ⚠ freshop_id is NEVER set here — it means "confirmed UPC match" and the
//     coupon engine keys on it. A name guess must not claim that.

import {
  FRESHOP_APP_KEY, FRESHOP_STORE_ID, isAlcohol,
  type FreshopProduct,
} from '@/lib/freshop-sync';

const IMAGE_BASE = 'https://images.freshop.ncrcloud.com';

/** Minimum confidence to accept a photo at all. */
export const MIN_SCORE = 0.6;
/** Minimum confidence to ALSO rewrite the display name. */
export const NAME_SCORE = 0.85;

/** Our category → acceptable Freshop canonical top-path segments. */
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

/** Words carrying no matching signal — packaging, units, filler. */
const NOISE = new Set([
  'LB', 'LBS', 'OZ', 'CT', 'EA', 'EACH', 'PK', 'PKG', 'PACK', 'COUNT',
  'APPROX', 'ABOUT', 'SIZE', 'OUR', 'THE', 'AND', 'WITH', 'PER', 'IN',
  'OF', 'A', 'ZZZ',
]);

function stripZzz(s: string): string {
  return s.replace(/\s*\(?\d+(\.\d+)?\s*zzz\)?/gi, '').trim();
}

/**
 * POS register abbreviations → real words, so we SEARCH Sinclair's with terms
 * their engine understands ("HSBRWN PTY" → "hash brown patty" finds it;
 * "SCHUBERT DNR YST RLS" → "schubert dinner yeast rolls"). Vowel-dropped
 * shorthand doesn't match their search at all otherwise. Curated + safe in a
 * grocery context; the department gate + scoring still guard against a stray
 * expansion pointing at the wrong item. Extend freely as new ones surface.
 */
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
  BLBRRY: 'blueberry', ORG: 'orange', LMNADE: 'lemonade', BEV: 'beverage',
  PZA: 'pizza', PEPP: 'pepperoni', SND: 'sandwich', BRGR: 'burger',
  NGT: 'nugget', CRNCH: 'crunch', ASPRG: 'asparagus', CUTS: 'cuts',
  // brands
  MM: 'minute maid', BC: 'best choice', BSTCH: 'best choice', KR: 'kraft',
  PF: 'prairie farms', HNZ: 'heinz', DELMNT: 'del monte', FLVRPAC: 'flavor pac',
};

/** First two path segments of a Freshop shop URL; null when the URL is flat. */
function deptPath(p: FreshopProduct): { top: string; sub: string } | null {
  const m = (p.canonical_url || '').match(/\/shop\/([^/]+)\/([^/]+)/);
  return m ? { top: m[1].toLowerCase(), sub: (m[2] || '').toLowerCase() } : null;
}

/** Meaningful uppercase tokens — units and size markers removed, POS
 *  abbreviations expanded to real words so Sinclair's search can find them. */
export function tokenize(name: string): string[] {
  const n = stripZzz(name)
    .toUpperCase()
    .replace(/(\d+)\s*PERCENT/g, '$1%')                            // "80 Percent" → "80%"
    .replace(/~?\s*\d+(\.\d+)?\s*(LB|LBS|#|OZ|CT|EA)\b/g, ' ')     // "~5lb", "16 oz"
    .replace(/[^A-Z0-9%\s]/g, ' ');
  const raw = n.split(/\s+/).filter(t => t && !NOISE.has(t) && !/^\d+(\.\d+)?$/.test(t));
  // Expand abbreviations (may become multiple tokens: HSBRWN → HASH, BROWN)
  const out: string[] = [];
  for (const t of raw) {
    const exp = ABBREV[t];
    if (exp) out.push(...exp.toUpperCase().split(' '));
    else out.push(t);
  }
  return out;
}

/** Is `short` an in-order subsequence of `long`, anchored on the first letter? */
function isSubsequence(short: string, long: string): boolean {
  if (!short || short.length > long.length) return false;
  if (short[0] !== long[0]) return false;
  let i = 0;
  for (const c of long) if (i < short.length && c === short[i]) i++;
  return i === short.length;
}

/** 1 = exact/prefix, 0.9 = vowel-dropped abbreviation, 0 = no match. */
function tokenMatch(ours: string, theirs: string): number {
  if (ours === theirs) return 1;
  if (theirs.startsWith(ours) || ours.startsWith(theirs)) return 1;
  if (isSubsequence(ours, theirs)) return 0.9;
  return 0;
}

/** Share of OUR tokens found in the candidate, penalised for extra verbosity. */
export function scoreMatch(ourName: string, candidateName: string): number {
  const ours = tokenize(ourName);
  const theirs = tokenize(candidateName);
  if (!ours.length || !theirs.length) return 0;
  let total = 0;
  for (const t of ours) {
    let best = 0;
    for (const c of theirs) best = Math.max(best, tokenMatch(t, c));
    total += best;
  }
  const verbosity = Math.max(0, theirs.length - ours.length);
  return (total / ours.length) * (1 - Math.min(0.25, verbosity * 0.03));
}

/** Leading number of a size string, for corroboration ("10 ct" → "10"). */
function sizeNum(s: string | null | undefined): string | null {
  const m = String(s ?? '').match(/(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

/**
 * Clean display name: Sinclair's name minus any trailing size/count. Our own
 * pkg_size carries the size, and the matched SKU's pack may differ from ours
 * (a 44.5 oz Totino's row can match the 50 ea listing — same product, same
 * packaging art, different pack), so carrying their size across would be wrong.
 */
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
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Search Sinclair's, retrying once on failure. NCR rate-limits datacenter IPs
 * (Vercel) hard, so a single blocked call would otherwise make Find Photos
 * report "no matches" for everything. One paced retry rides out the throttle.
 * Returns [] for a genuine empty result, null only when Sinclair's truly
 * wouldn't answer after the retry.
 */
async function searchFreshop(term: string): Promise<FreshopProduct[] | null> {
  const url = `https://api.freshop.ncrcloud.com/1/products`
    + `?app_key=${FRESHOP_APP_KEY}&store_id=${FRESHOP_STORE_ID}`
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

/**
 * Best match for one product, or null when nothing clears the gates.
 * `rateLimited` distinguishes "Sinclair's didn't answer" from "no match" so
 * the caller reports honestly instead of marking items unmatched.
 */
export async function findMatchFor(
  description: string,
  category: string,
  pkgSize: string | null,
  price: number | null,
): Promise<{ candidate: ImageCandidate | null; rateLimited: boolean }> {
  const allowedPaths = CATEGORY_PATHS[category];
  if (!allowedPaths) return { candidate: null, rateLimited: false };

  const toks = tokenize(description);
  if (!toks.length) return { candidate: null, rateLimited: false };

  // Progressive relaxation: the full abbreviated name rarely hits Sinclair's
  // search, but its leading brand token usually does ("SCHUBERT" → all the
  // Sister Schubert's listings). Stop at the first width that yields a match.
  const widths = Array.from(new Set([toks.length, 3, 2, 1])).filter(n => n >= 1 && n <= toks.length);

  for (let wi = 0; wi < widths.length; wi++) {
    const n = widths[wi];
    if (wi > 0) await sleep(200); // gentle pacing between relaxation attempts
    const term = toks.slice(0, n).join(' ');
    const items = await searchFreshop(term);
    if (items === null) return { candidate: null, rateLimited: true };

    let best: ImageCandidate | null = null;
    for (const item of items) {
      if (!item.cover_image) continue;                    // gate 3
      if (isAlcohol(item)) continue;
      const path = deptPath(item);
      if (!path) continue;                                // flat AWG url
      if (!allowedPaths.includes(path.top)) continue;     // gate 1

      const sizeMatch = !!sizeNum(pkgSize) && sizeNum(pkgSize) === sizeNum(item.size);
      const itemPrice = typeof item.base_price === 'number' ? item.base_price : null;
      const priceMatch = price != null && itemPrice != null && Math.abs(itemPrice - price) < 0.01;

      // Size/price agreement is strong corroboration that this is the same
      // product, so it lifts confidence toward the rename threshold.
      let score = scoreMatch(description, item.name || '');
      if (sizeMatch) score += 0.15;
      if (priceMatch) score += 0.15;
      score = Math.min(1, score);

      if (score < MIN_SCORE) continue;                    // gate 2
      if (best && score <= best.score) continue;

      best = {
        proper_name: cleanName(item.name || ''),
        freshop_name: stripZzz((item.name || '').trim()),
        image_url: `${IMAGE_BASE}/${item.cover_image}_large.png`,
        score: Math.round(score * 100) / 100,
        dept_path: `${path.top}/${path.sub}`,
        freshop_size: item.size ? stripZzz(item.size) || null : null,
        freshop_price: itemPrice,
        rename: score >= NAME_SCORE && (sizeMatch || priceMatch),
        size_match: sizeMatch,
        price_match: priceMatch,
      };
    }

    if (best) return { candidate: best, rateLimited: false };
  }

  return { candidate: null, rateLimited: false };
}
