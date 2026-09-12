// src/lib/store-photo-match.ts
//
// Copy a real photo from a Sinclair's STORE listing onto a barge-form row
// that never got one. The nightly UPC sync only stamps freshop_id when the
// barcodes line up — "LEMONS EACH" on the paper form and a lemon with a
// photo in the full store are the same produce, different names, so the
// barge row stays "needs a photo — not on Sinclair's site".
//
// This matcher never hits Sinclair's website. It only looks at photos we
// already imported with the full store.

import { scoreMatch, tokenize } from '@/lib/image-backfill';

export interface PhotoNeed {
  id: string;
  description: string;
  category: string;
  pkg_size: string | null;
  price: number;
  upc: string | null;
}

export interface PhotoDonor {
  id: string;
  description: string;
  category: string;
  pkg_size: string | null;
  price: number;
  upc: string | null;
  image_url: string;
  store_only: boolean;
}

export interface StorePhotoMatch {
  barge: PhotoNeed;
  donor: PhotoDonor;
  how: 'upc' | 'name';
  score: number;
  /** High enough to tick "use photo" by default. */
  autoCheck: boolean;
}

const AUTO_NAME = 0.75;
const SHOW_NAME = 0.58;
const SHOW_CROSS_CAT = 0.88;

export function isRealPhotoUrl(url: string | null | undefined): boolean {
  const u = String(url || '');
  if (!u) return false;
  // Sinclair's generic department icon — same grey basket on limes and lime juice.
  if (u.includes('fp_dpt_generic')) return false;
  return true;
}

function upcKey(upc: string | null | undefined): string {
  return String(upc || '').replace(/\D/g, '');
}

/**
 * Best store (or other photographed) listing for each barge row that has no
 * photo. UPC wins. Name matching uses the same abbreviation-aware tokens as
 * Find Photos, so LEMONS EACH lines up with a store lemon.
 */
export function matchStorePhotos(needs: PhotoNeed[], donors: PhotoDonor[]): {
  matches: StorePhotoMatch[];
  unmatched: PhotoNeed[];
} {
  const realDonors = donors.filter(d => isRealPhotoUrl(d.image_url));
  const byUpc = new Map<string, PhotoDonor[]>();
  const byToken = new Map<string, PhotoDonor[]>();

  for (const d of realDonors) {
    const u = upcKey(d.upc);
    if (u.length >= 4) {
      const list = byUpc.get(u) || [];
      list.push(d);
      byUpc.set(u, list);
    }
    for (const t of tokenize(d.description)) {
      const list = byToken.get(t) || [];
      list.push(d);
      byToken.set(t, list);
    }
  }

  const matches: StorePhotoMatch[] = [];
  const unmatched: PhotoNeed[] = [];

  for (const barge of needs) {
    const ownUpc = upcKey(barge.upc);
    let best: StorePhotoMatch | null = null;

    if (ownUpc.length >= 4) {
      const hit = (byUpc.get(ownUpc) || []).find(d => d.id !== barge.id);
      if (hit) best = { barge, donor: hit, how: 'upc', score: 1, autoCheck: true };
    }

    if (!best) {
      const seen = new Set<string>();
      let bestScore = 0;
      let bestDonor: PhotoDonor | null = null;
      let sameCat = false;
      for (const t of tokenize(barge.description)) {
        for (const d of byToken.get(t) || []) {
          if (d.id === barge.id || seen.has(d.id)) continue;
          seen.add(d.id);
          const s = scoreMatch(barge.description, d.description);
          const preferCat = d.category === barge.category;
          if (s > bestScore || (s === bestScore && preferCat && !sameCat)) {
            bestScore = s;
            bestDonor = d;
            sameCat = preferCat;
          }
        }
      }
      const floor = sameCat ? SHOW_NAME : SHOW_CROSS_CAT;
      if (bestDonor && bestScore >= floor) {
        best = {
          barge,
          donor: bestDonor,
          how: 'name',
          score: bestScore,
          autoCheck: sameCat && bestScore >= AUTO_NAME,
        };
      }
    }

    if (best) matches.push(best);
    else unmatched.push(barge);
  }

  matches.sort((a, b) => {
    if (a.how !== b.how) return a.how === 'upc' ? -1 : 1;
    return b.score - a.score;
  });

  return { matches, unmatched };
}
