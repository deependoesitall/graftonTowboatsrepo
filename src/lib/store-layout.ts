// src/lib/store-layout.ts
// Store walking order for shopping mode — turns Sinclair's item locations
// ("Aisle 10b", "Produce", "Deli") into ordered groups so staff shop an
// order in one efficient pass instead of criss-crossing the store.
//
// The zone order is manager-editable (admin_settings.store_zone_order).
// It is a list of named zones with a special "Aisles" token marking where
// the numbered aisles fall, e.g.:
//   ["Produce", "Bakery", "Deli", "Meat", "Aisles", "Dairy", "Frozen"]

export const AISLES_TOKEN = 'Aisles';

export const DEFAULT_ZONE_ORDER: string[] = [
  'Produce', 'Bakery', 'Deli', 'Meat', AISLES_TOKEN, 'Dairy', 'Frozen',
];

export const NO_LOCATION_LABEL = 'No location — find manually';
/** Off-catalog requests Sinclair's buys elsewhere (Walmart etc.). NOT an
 *  aisle and NOT a misplaced grocery item — it's a separate trip, so it
 *  gets its own group and sits last, after everything in the store. */
export const OUTSIDE_PICKUP_LABEL = 'Outside pickup — buy at another store';

export type ParsedLocation =
  | { kind: 'aisle'; num: number; sub: string }   // "Aisle 10b" → num 10, sub "b"
  | { kind: 'zone'; name: string }                // "Produce", "Deli Dept", …
  | null;                                         // missing / empty

/** Parse a raw Sinclair location string into a sortable shape. */
export function parseLocation(raw: string | null | undefined): ParsedLocation {
  const loc = (raw || '').trim();
  if (!loc) return null;
  // "Aisle 10b", "aisle 4", "10B", "Aisle 12 a"
  const m = loc.match(/^(?:aisle\s*)?(\d+)\s*([a-z])?$/i) || loc.match(/^aisle\s*(\d+)\s*([a-z])?/i);
  if (m) return { kind: 'aisle', num: parseInt(m[1], 10), sub: (m[2] || '').toLowerCase() };
  return { kind: 'zone', name: loc };
}

/** Group label a location belongs to ("Aisle 10", "Produce", or the no-location bucket). */
export function locationGroupLabel(raw: string | null | undefined): string {
  const parsed = parseLocation(raw);
  if (!parsed) return NO_LOCATION_LABEL;
  if (parsed.kind === 'aisle') return `Aisle ${parsed.num}`;
  return parsed.name;
}

// Match a zone location against a configured zone name (case-insensitive,
// containment both ways so "Deli Dept" matches zone "Deli").
function matchesZone(locName: string, zoneName: string): boolean {
  const a = locName.toLowerCase();
  const b = zoneName.toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

export interface LocationGroup<T> {
  key: string;    // stable key for React
  label: string;  // "Produce" · "Aisle 10" · NO_LOCATION_LABEL
  items: T[];
}

/**
 * Group items into store-walking order.
 *
 * Ordering priority:
 *   1. Sinclair's OWN walkpath sequence (fulfillment_walkpath.sequence from
 *      Freshop, snapshot as location_seq) — the store's configured walk order.
 *   2. For groups without a sequence: the manager's zone list — zones listed
 *      before "Aisles" → numbered aisles ascending (letter as tiebreaker
 *      within an aisle) → zones after "Aisles" → unlisted zones alphabetical.
 *   3. Items with no location always last.
 */
export function groupByWalkingOrder<T extends {
  location: string | null; description: string; location_seq?: number | null;
  item_type?: string | null; service_type?: string | null;
}>(
  items: T[],
  zoneOrder: string[] = DEFAULT_ZONE_ORDER,
): LocationGroup<T>[] {
  const order = zoneOrder.length ? zoneOrder : DEFAULT_ZONE_ORDER;
  const aislesAt = order.findIndex(z => z.toLowerCase() === AISLES_TOKEN.toLowerCase());
  const preZones = order.slice(0, aislesAt < 0 ? order.length : aislesAt).filter(z => z.toLowerCase() !== AISLES_TOKEN.toLowerCase());
  const postZones = aislesAt < 0 ? [] : order.slice(aislesAt + 1).filter(z => z.toLowerCase() !== AISLES_TOKEN.toLowerCase());

  const zoneGroups = new Map<string, { label: string; items: T[] }>(); // key: matched configured zone (or raw name)
  const aisleGroups = new Map<number, T[]>();
  const noLocation: T[] = [];
  const outsidePickup: T[] = [];

  for (const item of items) {
    // Sinclair's drives to Walmart for these. Grouping them with items whose
    // aisle we simply don't know made a separate errand look like a data gap.
    if (item.item_type === 'service' && item.service_type === 'other_pickup') {
      outsidePickup.push(item);
      continue;
    }
    const parsed = parseLocation(item.location);
    if (!parsed) { noLocation.push(item); continue; }
    if (parsed.kind === 'aisle') {
      if (!aisleGroups.has(parsed.num)) aisleGroups.set(parsed.num, []);
      aisleGroups.get(parsed.num)!.push(item);
      continue;
    }
    // Zone: bucket under the configured zone name when one matches, else raw name
    const configured = [...preZones, ...postZones].find(z => matchesZone(parsed.name, z));
    const key = configured || parsed.name;
    if (!zoneGroups.has(key)) zoneGroups.set(key, { label: key, items: [] });
    zoneGroups.get(key)!.items.push(item);
  }

  // Within an aisle: letter position (10a before 10b), then description
  const aisleItemSort = (a: T, b: T) => {
    const pa = parseLocation(a.location), pb = parseLocation(b.location);
    const sa = pa?.kind === 'aisle' ? pa.sub : '';
    const sb = pb?.kind === 'aisle' ? pb.sub : '';
    return sa.localeCompare(sb) || a.description.localeCompare(b.description);
  };
  const byDescription = (a: T, b: T) => a.description.localeCompare(b.description);

  const result: LocationGroup<T>[] = [];
  const takeZone = (name: string) => {
    const g = zoneGroups.get(name);
    if (!g) return;
    zoneGroups.delete(name);
    result.push({ key: `zone-${name}`, label: g.label, items: g.items.sort(byDescription) });
  };

  preZones.forEach(takeZone);
  Array.from(aisleGroups.keys()).sort((a, b) => a - b).forEach(num => {
    result.push({ key: `aisle-${num}`, label: `Aisle ${num}`, items: aisleGroups.get(num)!.sort(aisleItemSort) });
  });
  postZones.forEach(takeZone);
  // Zones the manager hasn't listed yet — alphabetical, before the no-location bucket
  Array.from(zoneGroups.keys()).sort((a, b) => a.localeCompare(b)).forEach(takeZone);

  // Re-rank by Sinclair's own walkpath sequence where we have it: sequenced
  // groups first (in the store's real walk order), then the zone-heuristic
  // groups in their existing order, no-location always last.
  const groupSeq = (g: LocationGroup<T>): number | null => {
    let min: number | null = null;
    for (const it of g.items) {
      const s = it.location_seq;
      if (typeof s === 'number' && isFinite(s) && (min === null || s < min)) min = s;
    }
    return min;
  };
  const ranked = result
    .map((g, heuristicIdx) => ({ g, heuristicIdx, seq: groupSeq(g) }))
    .sort((a, b) => {
      if (a.seq != null && b.seq != null) return a.seq - b.seq || a.heuristicIdx - b.heuristicIdx;
      if (a.seq != null) return -1;
      if (b.seq != null) return 1;
      return a.heuristicIdx - b.heuristicIdx;
    })
    .map(r => r.g);

  if (noLocation.length) {
    ranked.push({ key: 'no-location', label: NO_LOCATION_LABEL, items: noLocation.sort(byDescription) });
  }
  // Dead last on purpose: finish the store, then make the extra trip.
  if (outsidePickup.length) {
    ranked.push({ key: 'outside-pickup', label: OUTSIDE_PICKUP_LABEL, items: outsidePickup.sort(byDescription) });
  }
  return ranked;
}

/** Sanitize a manager-submitted zone order: strings only, trimmed, deduped, "Aisles" token guaranteed. */
export function sanitizeZoneOrder(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw.map(z => String(z ?? '').trim()).filter(Boolean).slice(0, 30)
    : [];
  const seen = new Set<string>();
  const clean = list.filter(z => {
    const k = z.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!clean.some(z => z.toLowerCase() === AISLES_TOKEN.toLowerCase())) clean.push(AISLES_TOKEN);
  return clean.length > 1 ? clean : [...DEFAULT_ZONE_ORDER];
}
