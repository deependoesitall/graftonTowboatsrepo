// src/app/api/admin/sync-status/route.ts
// Read-only view of the nightly catalog sync checkpoint — powers the quiet
// "Catalog last synced ..." line on the admin Products page. The sync itself
// is fully automatic (12:05 AM kickoff + overnight chunks); admins never need
// to run anything by hand.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products' });
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('catalog_sync_state')
    .select('state, updated_at')
    .eq('id', 1)
    .single();

  const state = (data?.state || {}) as {
    day?: string;
    depts?: Array<{ name: string; pages: number; done: number[] }>;
    completedAt?: string;
    inserted?: number;
    applied?: number;
    lastError?: string;
  };

  const pagesDone = (state.depts || []).reduce((s, d) => s + (d.done?.length || 0), 0);
  const pagesTotal = (state.depts || []).reduce((s, d) => s + (d.pages || 0), 0);
  const sizedItems = (state.depts || []).reduce((s, d) => s + ((d as { total?: number }).total || 0), 0);

  return NextResponse.json({
    completed_at: state.completedAt || null,
    session_day: state.day || null,
    in_progress: !state.completedAt && pagesTotal > 0,
    pages_done: pagesDone,
    pages_total: pagesTotal,
    /** What Freshop reported as the store size when this session was sized —
     * visible so a mid-rebuild runt session is OBVIOUS, not silent. */
    sized_items: sizedItems,
    departments: (state.depts || []).map(d => `${d.name}: ${d.done?.length || 0}/${d.pages}`),
    products_updated: state.applied || 0,
    store_items_imported: state.inserted || 0,
    last_error: state.lastError || null,
    checkpoint_updated_at: data?.updated_at || null,
  });
}
