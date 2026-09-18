// src/lib/active-boat.ts
//
// Multi-boat "ordering as" selection. Persists locally; callers may also
// mirror company/vessel onto customer_profiles. Single-boat users never see UI.

import { getVesselInfo, saveVesselInfo } from '@/lib/cart';
import { vesselNameKey } from '@/lib/vessel-membership';

const KEY = 'gts_active_boat';
const EVENT = 'gts-active-boat';

export interface ActiveBoat {
  vesselId?: string;
  company: string;
  boat: string;
}

export function getActiveBoat(): ActiveBoat | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveBoat;
    if (!parsed?.boat) return null;
    return {
      vesselId: parsed.vesselId || undefined,
      company: String(parsed.company || ''),
      boat: String(parsed.boat || ''),
    };
  } catch {
    return null;
  }
}

export function setActiveBoat(boat: ActiveBoat): void {
  if (typeof window === 'undefined') return;
  const next: ActiveBoat = {
    vesselId: boat.vesselId || undefined,
    company: String(boat.company || '').trim(),
    boat: String(boat.boat || '').trim(),
  };
  if (!next.boat) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* private window */ }
  // Keep checkout autofill in sync so "ordering as" is what the form shows.
  const cur = getVesselInfo();
  saveVesselInfo({
    ...cur,
    company_name: next.company || cur.company_name,
    vessel_name: next.boat,
  });
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  } catch { /* fine */ }
}

export function clearActiveBoat(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(KEY); } catch { /* fine */ }
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: null })); } catch { /* fine */ }
}

export function subscribeActiveBoat(cb: (boat: ActiveBoat | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb(getActiveBoat());
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

/** Pick which boat to start on: saved selection if still in memberships, else first. */
export function resolveActiveBoat(
  links: ActiveBoat[],
): ActiveBoat | null {
  if (!links.length) return null;
  if (links.length === 1) return links[0];
  const saved = getActiveBoat();
  if (saved) {
    const match = links.find(l =>
      (saved.vesselId && l.vesselId && saved.vesselId === l.vesselId)
      || (vesselNameKey(l.boat) === vesselNameKey(saved.boat)
        && String(l.company || '').toLowerCase() === String(saved.company || '').toLowerCase())
    );
    if (match) return match;
  }
  return links[0];
}

/** Does this order belong to the selected boat? */
export function orderMatchesActiveBoat(
  order: { company_name?: string | null; vessel_name?: string | null; vessel_id?: string | null },
  boat: ActiveBoat | null,
): boolean {
  if (!boat?.boat) return true; // no selection → don't filter
  if (boat.vesselId && order.vessel_id && boat.vesselId === order.vessel_id) return true;
  const c = String(order.company_name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = String(boat.company ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (want && c && c !== want) return false;
  return vesselNameKey(order.vessel_name || '') === vesselNameKey(boat.boat);
}
