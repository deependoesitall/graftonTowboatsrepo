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
 * Group items into store-walking order:
 *   zones listed before "Aisles" → numbered aisles (ascending, letter as
 *   tiebreaker within an aisle) → zones listed after "Aisles" → any zones
 *   not in the configured list (alphabetical) → items with no location last.
 */
export function groupByWalkingOrder<T extends { location: string | null; description: string }>(
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

  for (const item of items) {
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
  if (noLocation.length) {
    result.push({ key: 'no-location', label: NO_LOCATION_LABEL, items: noLocation.sort(byDescription) });
  }
  return result;
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
