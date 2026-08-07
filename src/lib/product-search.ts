// src/lib/product-search.ts
// Instant, offline-capable product search for the barge order form.
//
// WHY THIS EXISTS: crews order from towboats on the river with weak, flaky
// cell service. A server round-trip per search felt broken out there. The
// barge order form is only ~1,100 items, so the whole searchable index ships
// to the device ONCE and every keystroke is answered locally — zero network,
// instant, and it keeps working if the signal drops mid-order.
//
// Ranking is deliberately grocery-aware:
//   • multi-word queries match in ANY order ("ground beef" == "beef ground")
//   • POS abbreviations resolve both directions ("minute maid" finds
//     "MM LEMONADE"; "hsbrwn" finds "hash brown")
//   • typo tolerance on longer words ("cofee" → "coffee")
//   • exact/prefix hits always outrank loose ones, so the obvious item is #1

import { keywordsFor } from '@/lib/search-keywords';

export interface SearchProduct {
  id: string;
  description: string;      // register-style name (what admin/pick sheets use)
  details: string | null;   // customer-facing name when we have a nicer one
  category: string;
  sub_category?: string | null;
  /** Admin-entered search tags. */
  tags?: string[] | null;
  /** Paper order-form grouping ("Meat" / "Beef") — great natural keywords. */
  form_section?: string | null;
  form_subsection?: string | null;
  pkg_size: string | null;
  uom: string | null;
  price: number;
  image_url: string | null;
  upc: string | null;
  billed_by_weight?: boolean;
  quantity_step?: number | null;
  quantity_label?: string | null;
  quantity_size_ratio?: number | null;
  popularity?: number | null;
}

/** POS shorthand ⇄ real words, so either spelling finds the item. */
const ABBREV: Record<string, string> = {
  MM: 'minute maid', BC: 'best choice', BSTCH: 'best choice', KR: 'kraft',
  PF: 'prairie farms', HNZ: 'heinz', DELMNT: 'del monte', FLVRPAC: 'flavor pac',
  HSBRWN: 'hash brown', HSHBRN: 'hash brown', PTY: 'patty', PTYS: 'patties',
  DNR: 'dinner', YST: 'yeast', RLS: 'rolls', RL: 'roll', FRZ: 'frozen',
  PEPPR: 'pepper', PPR: 'pepper', JALPENO: 'jalapeno', ASPRGS: 'asparagus',
  CHDR: 'cheddar', CHS: 'cheese', MLK: 'milk', BRD: 'bread', CHKN: 'chicken',
  CKN: 'chicken', SAUS: 'sausage', SASG: 'sausage', VEG: 'vegetable',
  SHRD: 'shredded', SLCD: 'sliced', BNLS: 'boneless', SKNLS: 'skinless',
  BRST: 'breast', THGH: 'thigh', GRND: 'ground', SMKD: 'smoked',
  CRM: 'cream', BTR: 'butter', SGR: 'sugar', FLR: 'flour', WHT: 'wheat',
  WHL: 'whole', CHOC: 'chocolate', VAN: 'vanilla', STRWBRY: 'strawberry',
  BLBRRY: 'blueberry', ORG: 'orange', LMNADE: 'lemonade', PZA: 'pizza',
  PEPP: 'pepperoni', SND: 'sandwich', BRGR: 'burger', NGT: 'nugget',
  YOP: 'yoplait', YOG: 'yogurt', JC: 'juice', WTR: 'water', TWL: 'towel',
  TISS: 'tissue', DTRGNT: 'detergent', LB: 'pound',
};
/** Reverse map so typing the real word also matches the abbreviation. */
const EXPANSIONS = new Map<string, string[]>();
for (const [abbr, full] of Object.entries(ABBREV)) {
  for (const w of full.split(' ')) {
    if (!EXPANSIONS.has(w)) EXPANSIONS.set(w, []);
    EXPANSIONS.get(w)!.push(abbr.toLowerCase());
  }
}

const STOP = new Set(['the', 'and', 'a', 'of', 'with', 'for', 'in', 'oz', 'ct', 'ea', 'lb', 'pk']);

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, ' ')   // punctuation → space ("LIVER, BEEF")
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(' ').filter(Boolean);
}

/** Every word a product should be findable by, including expansions. */
function productTerms(p: SearchProduct): string[] {
  const named = `${p.description} ${p.details || ''}`;
  const raw = [
    named,
    p.category,
    p.sub_category || '',
    p.form_section || '',       // "Meat", "Cold Deli" — the paper form's own groupings
    p.form_subsection || '',    // "Beef", "Poultry", "Condiments"
    (p.tags || []).join(' '),   // admin-entered tags
    p.pkg_size || '',
  ].join(' ');

  const base = tokens(raw);
  const out = new Set<string>(base);

  for (const t of base) {
    const up = t.toUpperCase();
    if (ABBREV[up]) for (const w of ABBREV[up].split(' ')) out.add(w); // MM → minute, maid
    const rev = EXPANSIONS.get(t);
    if (rev) for (const a of rev) out.add(a);                          // maid → mm
  }

  // Rule-derived keywords: how a cook would ACTUALLY search for this thing
  // ("pop" for Pepsi, "tp" for bath tissue, "hamburger" for ground chuck).
  for (const k of keywordsFor(`${named} ${p.category} ${p.sub_category || ''} ${p.form_subsection || ''}`)) {
    for (const w of k.split(' ')) out.add(w);
    out.add(k);
  }

  return Array.from(out);
}

/** One-edit Levenshtein check — cheap early-exit version. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else { i++; j++; }
  }
  return true;
}

export interface IndexedProduct {
  product: SearchProduct;
  terms: string[];
  haystack: string;   // full normalized name, for phrase/prefix hits
}

/** Pre-compute once when the index loads — keeps every keystroke O(n) cheap. */
export function buildIndex(products: SearchProduct[]): IndexedProduct[] {
  return products.map(p => ({
    product: p,
    terms: productTerms(p),
    haystack: normalize(`${p.details || ''} ${p.description}`),
  }));
}

/**
 * Score one product against the query tokens. Returns 0 when it isn't a match.
 * Higher is better. Every query token must hit something (AND semantics), so
 * "ground beef" never returns plain "beef broth".
 */
function scoreOne(item: IndexedProduct, qTokens: string[], qRaw: string): number {
  let total = 0;
  for (const q of qTokens) {
    let best = 0;
    // Whole-phrase prefix is the strongest signal ("bee" → "BEEF ROLLS")
    if (item.haystack.startsWith(q)) best = Math.max(best, 100);
    for (const t of item.terms) {
      if (t === q) { best = Math.max(best, 90); continue; }
      if (t.startsWith(q)) { best = Math.max(best, 70); continue; }
      if (q.length >= 4 && t.includes(q)) { best = Math.max(best, 45); continue; }
      // Typo tolerance only on longer words, so short tokens stay precise
      if (q.length >= 4 && Math.abs(t.length - q.length) <= 1 && withinOneEdit(t, q)) {
        best = Math.max(best, 35);
      }
    }
    if (best === 0) return 0;   // AND: this query word matched nothing
    total += best;
  }
  // Exact full-phrase match jumps to the top ("whole milk")
  if (item.haystack === qRaw) total += 200;
  else if (item.haystack.includes(qRaw)) total += 60;
  // Gentle nudge from Sinclair's popularity so common staples lead ties
  const pop = item.product.popularity;
  if (pop && pop > 0) total += Math.max(0, 12 - Math.log10(pop) * 4);
  // Prefer shorter names on equal relevance (less padding = more likely the item)
  total -= Math.min(8, item.haystack.length / 40);
  return total;
}

/** Rank products for a query. Empty query → empty result. */
export function searchProducts(
  index: IndexedProduct[],
  query: string,
  limit = 40,
): SearchProduct[] {
  const qRaw = normalize(query);
  if (!qRaw) return [];
  const qTokens = tokens(query).filter(t => !STOP.has(t) || tokens(query).length === 1);
  if (!qTokens.length) return [];

  // A pure digit query is a UPC lookup — match those directly.
  if (/^\d{4,}$/.test(qRaw)) {
    return index
      .filter(i => (i.product.upc || '').replace(/\D/g, '').includes(qRaw))
      .slice(0, limit)
      .map(i => i.product);
  }

  const scored: Array<{ p: SearchProduct; s: number }> = [];
  for (const item of index) {
    const s = scoreOne(item, qTokens, qRaw);
    if (s > 0) scored.push({ p: item.product, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map(x => x.p);
}
