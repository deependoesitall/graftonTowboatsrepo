// src/lib/vessel-membership.ts
// Helpers for company → boat → crew membership.
import { vesselKey } from '@/lib/vessel';

export type VesselMemberRole = 'cook' | 'captain' | 'other';

/** Stable key for UNIQUE(company_id, name_key) — same rules as vesselKey. */
export function vesselNameKey(name: string): string {
  return vesselKey(name);
}

/** Does this order's free-text vessel belong to the onboarded boat? */
export function orderMatchesVessel(
  order: { company_name?: string | null; vessel_name?: string | null },
  companyName: string,
  vesselNormalized: string,
): boolean {
  if (!vesselNormalized) return false;
  const c = String(order.company_name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = String(companyName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!c || !want || c !== want) return false;
  return vesselKey(order.vessel_name) === vesselNormalized;
}

export interface MemberVessel {
  vessel_id: string;
  vessel_name: string;
  company_id: string;
  company_name: string;
  role: VesselMemberRole;
}
