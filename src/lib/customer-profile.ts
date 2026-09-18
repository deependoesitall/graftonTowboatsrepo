// src/lib/customer-profile.ts
//
// Shared rules for "is this cook's profile ready for checkout autofill?"
// Used by /account (default tab + soft nudge) and kept in one place so the
// definition does not drift between Google signup UX and the order form.

export type ProfileCheckoutFields = {
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  vessel_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
};

/**
 * Incomplete profile (Profile-first default tab + soft nudge):
 *   missing first name AND/OR company AND/OR vessel.
 *
 * Last name, contact, and phone are encouraged in the nudge copy but do NOT
 * gate completeness — cooks often share a boat phone and skip a last name.
 *
 * Completeness is derived from SAVED profile fields only. There is no
 * localStorage "dismissed" flag: once first_name + company_name + vessel_name
 * are saved, the nudge never shows again (including returning visits).
 */
export function isProfileComplete(p: ProfileCheckoutFields | null | undefined): boolean {
  if (!p) return false;
  const first = (p.first_name || '').trim();
  const company = (p.company_name || '').trim();
  const vessel = (p.vessel_name || '').trim();
  return first.length > 0 && company.length > 0 && vessel.length > 0;
}

/** What is still missing — for warm nudge copy. */
export function missingProfileFields(p: ProfileCheckoutFields | null | undefined): string[] {
  const missing: string[] = [];
  if (!(p?.first_name || '').trim()) missing.push('your first name');
  if (!(p?.company_name || '').trim()) missing.push('company');
  if (!(p?.vessel_name || '').trim()) missing.push('vessel');
  return missing;
}

type Meta = Record<string, unknown> | null | undefined;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Prefill first/last from Google (or other OAuth) user_metadata when the
 * profile names are still empty. Prefer given_name / family_name; fall back
 * to splitting full_name or name on the first space.
 */
export function namesFromUserMetadata(meta: Meta): { first_name: string; last_name: string } {
  const given = str(meta?.given_name);
  const family = str(meta?.family_name);
  if (given || family) {
    return { first_name: given, last_name: family };
  }
  const full = str(meta?.full_name) || str(meta?.name);
  if (!full) return { first_name: '', last_name: '' };
  const i = full.indexOf(' ');
  if (i < 0) return { first_name: full, last_name: '' };
  return { first_name: full.slice(0, i).trim(), last_name: full.slice(i + 1).trim() };
}

/**
 * Guest → account: fill empty profile fields from local cart vessel_info
 * (company, vessel, contact, phone). Never overwrites a non-empty saved value.
 */
export function mergeGuestVesselIntoProfile<T extends ProfileCheckoutFields>(
  profile: T,
  vessel: {
    company_name?: string;
    vessel_name?: string;
    contact_name?: string;
    phone?: string;
  } | null | undefined,
): T {
  if (!vessel) return profile;
  const pick = (cur: string | null | undefined, next: string | undefined) =>
    (cur || '').trim() ? (cur || '') : (next || '').trim();
  return {
    ...profile,
    company_name: pick(profile.company_name, vessel.company_name),
    vessel_name: pick(profile.vessel_name, vessel.vessel_name),
    contact_name: pick(profile.contact_name, vessel.contact_name),
    phone: pick(profile.phone, vessel.phone),
  };
}
