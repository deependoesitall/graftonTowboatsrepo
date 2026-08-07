// src/lib/vessel.ts
//
// Vessel-name matching that never splits an invoice.
//
// THE TENSION: a brand-new boat must be able to show up and order at any time,
// so vessel names stay FREE TEXT — no dropdown to maintain, no gate on the
// customer, no "add the vessel first" step for Jen. But billing groups by
// company AND vessel ("Ingram — Jenny Kay", one invoice per boat), so a boat
// spelled two ways becomes two invoices, which is painful to unwind after the
// fact.
//
// THE FIX: normalize on READ, never on write. Anyone types anything; grouping
// collapses the variants. These all resolve to one boat:
//     "W. Scott Noble"   "Scott Noble"   "SCOTT NOBLE"
//     "M/V River Hawk"   "MV River Hawk"   "river hawk"
//     "Co-Op Vanguard"   "Coop Vanguard"
//
// Nothing is rewritten in the database — the original spelling is preserved on
// every record. Only the grouping key is normalized.

/** Vessel prefixes crews and dispatchers use interchangeably. */
const PREFIXES = /^(m\/?v|mv|m\/?t|mt|tug|towboat|the)\s+/i;
/** Single-letter initials people drop: "W. Scott Noble" → "Scott Noble". */
const LEADING_INITIALS = /^(?:[a-z]\.?\s+){1,2}/i;

/**
 * The key two spellings of the same boat share. Lowercased, punctuation and
 * spacing flattened, common prefixes and leading initials dropped.
 */
export function vesselKey(name: string | null | undefined): string {
  let s = String(name ?? '').toLowerCase().trim();
  if (!s) return '';
  s = s.replace(/[.,'"`]/g, '');        // punctuation is noise
  s = s.replace(/[-_/]+/g, ' ');        // "Co-Op" ≡ "Coop", "M/V" ≡ "M V"
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(PREFIXES, '');
  s = s.replace(LEADING_INITIALS, '');
  s = s.replace(/\s+/g, '');            // "coop" ≡ "co op"
  return s;
}

/** Company + vessel identity — the unit one invoice covers. */
export function billingKey(company: string | null | undefined, vessel: string | null | undefined): string {
  const c = String(company ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const v = vesselKey(vessel);
  return v ? `${c}|${v}` : c;
}

/**
 * Pick the spelling to SHOW for a boat when records disagree. Prefers the most
 * frequently used, then the longest/most complete ("W. Scott Noble" over
 * "Scott Noble") so the invoice carries the fullest name.
 */
export function canonicalVesselName(names: Array<string | null | undefined>): string {
  const counts = new Map<string, number>();
  for (const n of names) {
    const t = String(n ?? '').trim();
    if (t) counts.set(t, (counts.get(t) || 0) + 1);
  }
  if (!counts.size) return '';
  return Array.from(counts.entries())
    .sort((a, b) => (b[1] - a[1]) || (b[0].length - a[0].length))[0][0];
}

/**
 * Suggestions for a free-text vessel field: the known spellings, most recent
 * first. Backs a <datalist> so people naturally reuse the existing spelling —
 * guidance, never a gate. Typing something brand-new always works.
 */
export function vesselSuggestions(
  records: Array<{ vessel_name?: string | null; company_id?: string | null }>,
  companyId?: string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of records) {
    const name = (r.vessel_name || '').trim();
    if (!name) continue;
    if (companyId && r.company_id && r.company_id !== companyId) continue;
    const k = vesselKey(name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(name);
  }
  return out;
}
