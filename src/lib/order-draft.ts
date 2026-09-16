// src/lib/order-draft.ts
//
// The client half of Drafted Orders: what gets parked, and when.
//
// ⚠️ A DRAFT IS THE BUILDER'S STATE, NOT AN ORDER. Nothing here creates,
// emails, bills or queues anything. See migration 090 and
// /api/admin/order-drafts.

import type { AdditionalServices } from '@/types';

/** Everything the builder needs to come back exactly as it was left. */
export interface DraftState {
  /** Bumped only if a future shape genuinely cannot be read by the old loader. */
  v: 1;
  header: Record<string, unknown>;
  qty: Record<string, number>;
  linePay: Record<string, { paid_by: 'vessel' | 'deck' | 'cod'; cod_name: string }>;
  customLines: unknown[];
  extraById: Record<string, unknown>;
  services: AdditionalServices;
  sendConfirmation: boolean;
  mode: string;
  step: string;
}

export interface DraftRow {
  id: string;
  company_name: string;
  vessel_name: string;
  line_count: number;
  subtotal: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  status: 'draft' | 'placed' | 'discarded';
  order_id: string | null;
  placed_at: string | null;
}

/**
 * Is this worth parking?
 *
 * ⚠️ AN EMPTY DRAFT IS WORSE THAN NO DRAFT. Saving the moment the page loads
 * would fill the shared list with blank rows nobody started — and a list of
 * twenty "Untitled, 0 lines" entries is a list people stop reading, which
 * takes the real drafts down with it. A draft earns its place once it knows
 * which boat it is for, or has a line on it.
 */
export function worthSaving(vesselName: string, lineCount: number): boolean {
  return vesselName.trim().length >= 2 || lineCount > 0;
}

/** "Jen · 20 minutes ago" — how the list says who had this last. */
export function draftTouchedLabel(row: Pick<DraftRow, 'updated_by' | 'updated_at'>): string {
  const who = (row.updated_by || '').trim();
  const when = relativeTime(row.updated_at);
  return who ? `${who} · ${when}` : when;
}

export function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return 'a minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs === 1) return 'an hour ago';
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * Someone else has been in here since we loaded it.
 *
 * Saving replaces `state` whole — the builder is the only thing that
 * understands the shape, and a half-merged draft is worse than either version.
 * So the honest thing is not to merge but to say so, and let the person decide.
 */
export function wasTouchedByAnotherSession(
  row: Pick<DraftRow, 'updated_by' | 'updated_at'>,
  ourLastSaveIso: string | null,
  ourName: string,
): boolean {
  if (!ourLastSaveIso) return false;
  if ((row.updated_by || '').trim() === ourName.trim()) return false;
  return Date.parse(row.updated_at) > Date.parse(ourLastSaveIso);
}
