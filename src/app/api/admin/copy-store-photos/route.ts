// src/app/api/admin/copy-store-photos/route.ts
//
// Instant photo fill for barge-form rows: copy a real image we already have
// on a Sinclair's store listing (LEMONS EACH ← store lemon with a photo).
// No live crawl — Find Photos still exists for items with no store twin.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { matchStorePhotos, type PhotoNeed, type PhotoDonor } from '@/lib/store-photo-match';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NEED_FIELDS = 'id, description, category, pkg_size, price, upc';
const DONOR_FIELDS = 'id, description, category, pkg_size, price, upc, image_url, store_only';

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const mode: string = body.mode || 'preview';
  const supabase = createServiceClient();

  if (mode === 'apply') {
    const picks: Array<{ id: string; image_url: string }> = body.picks || [];
    if (!Array.isArray(picks) || !picks.length) {
      return NextResponse.json({ error: 'No selections provided' }, { status: 400 });
    }

    let photos = 0;
    for (const p of picks) {
      if (!p?.id || !p?.image_url) continue;
      const { error } = await supabase.from('products').update({
        image_url: p.image_url,
        image_source: 'store_copy',
      }).eq('id', p.id).is('image_url', null);
      if (!error) photos++;
    }

    await supabase.from('activity_logs').insert({
      order_id: null,
      order_number: null,
      action: 'catalog_enriched',
      from_value: 'Sinclair store catalog',
      to_value: `${photos} photo${photos === 1 ? '' : 's'} copied onto barge items`,
      admin_username: session.username,
      admin_display_name: session.display_name,
      admin_role: session.role,
      note: 'Copied existing store photos onto barge-form rows (names unchanged)',
    });

    return NextResponse.json({ success: true, photos });
  }

  // ── PREVIEW ──
  const needs: PhotoNeed[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select(NEED_FIELDS)
      .eq('is_active', true)
      .eq('store_only', false)
      .is('image_url', null)
      .order('category')
      .order('description')
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    needs.push(...((data || []) as PhotoNeed[]));
    if (!data || data.length < 1000) break;
  }

  const donors: PhotoDonor[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select(DONOR_FIELDS)
      .eq('is_active', true)
      .not('image_url', 'is', null)
      .order('id')
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    donors.push(...((data || []) as PhotoDonor[]));
    if (!data || data.length < 1000) break;
  }

  const { matches, unmatched } = matchStorePhotos(needs, donors);

  return NextResponse.json({
    missing: needs.length,
    donors: donors.length,
    matches,
    unmatchedCount: unmatched.length,
    unmatchedSample: unmatched.slice(0, 40).map(u => ({
      id: u.id,
      description: u.description,
      category: u.category,
    })),
  });
}
