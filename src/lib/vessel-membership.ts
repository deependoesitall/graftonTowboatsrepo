// src/lib/vessel-membership.ts
// Helpers for company → boat → cook membership.
import { vesselKey } from '@/lib/vessel';

export type VesselMemberRole = 'cook' | 'captain' | 'other';

/** Stable key for UNIQUE(company_id, name_key) — same rules as vesselKey. */
export function vesselNameKey(name: string): string {
  return vesselKey(name);
}

export interface MemberVessel {
  vessel_id: string;
  vessel_name: string;
  company_id: string;
  company_name: string;
  role: VesselMemberRole;
}
