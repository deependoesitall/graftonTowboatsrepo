// src/app/api/admin/backfill-photos/route.ts
//
// Finds photos + proper names on Sinclair's site for catalog items the nightly
// UPC sync can't reach (no UPC, or a UPC that doesn't line up with theirs).
//
// TWO MODES, deliberately separated. Name matching is fuzzy, and a wrong photo
// is customer-visible, so nothing is written until a human has looked:
//   preview — search Sinclair's, return proposed matches for review
//   apply   — write ONLY the ids the reviewer confirmed
//
// Chunked like the catalog sync: Sinclair's rate-limits datacenter IPs, so we
// search in small concurrent batches under a time budget and report a cursor
// so the UI can continue where it left off.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { findMatchFor, type ImageCandidate } from '@/lib/image-backfill';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// NCR rate-limits Vercel's datacenter IP hard, so keep the request pattern
// gentle — small concurrency, a real breath between batches, fewer items per
// invocation (the client chains more chunks). This is why an aggressive first
// version came back empty: NCR was throttling every search.
const BATCH_SIZE = 2;          // concurrent items (each may do a couple searches)
const SCAN_PER_RUN = 24;       // products examined per invocation
const TIME_BUDGET_MS = 45_000;
const BATCH_DELAY_MS = 500;

interface Row {
  id: string;
  description: string;
  category: string;
  pkg_size: string | null;
  price: number;
  image_url: string | null;
  details: string | null;
}

export interface Proposal {
  id: string;
  description: string;
  category: string;
  pkg_size: string | null;
  price: number;
  current_details: string | null;
  candidate: ImageCandidate;
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const mode: string = body.mode || 'preview';
  const supabase = createServiceClient();

  // ── APPLY: write only what the reviewer confirmed ──
  if (mode === 'apply') {
    const picks: Array<{ id: string; image_url: string; details?: string }> = body.picks || [];
    if (!Array.isArray(picks) || !picks.length) {
      return NextResponse.json({ error: 'No selections provided' }, { status: 400 });
    }

    let photos = 0;
    let names = 0;
    for (const p of picks) {
      if (!p?.id || !p?.image_url) continue;
      // image_url always; details only when the reviewer kept the rename.
      // description and freshop_id are deliberately NEVER touched here.
      // Tag the source 'name_match' so the catalog flags it for review.
      const updates: Record<string, unknown> = { image_url: p.image_url, image_source: 'name_match' };
      if (p.details) { updates.details = p.details; names++; }
      const { error } = await supabase.from('products').update(updates).eq('id', p.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      photos++;
    }

    await supabase.from('activity_logs').insert({
      order_id: null,
      order_number: null,
      action: 'catalog_enriched',
      from_value: "Sinclair's website",
      to_value: `${photos} photo${photos === 1 ? '' : 's'} added${names ? ` · ${names} name${names === 1 ? '' : 's'} corrected` : ''} (name-matched, reviewed)`,
      admin_username: session.username,
      admin_display_name: session.display_name,
      admin_role: session.role,
      note: 'Photo backfill for items without a UPC match',
    });

    return NextResponse.json({ success: true, photos, names });
  }

  // ── PREVIEW: search Sinclair's, propose matches ──
  const cursor: number = Number(body.cursor) || 0;

  // Candidates: active items with no photo. freshop_id null means the nightly
  // UPC sync never matched them — exactly the rows that stay photo-less.
  const { data, error, count } = await supabase
    .from('products')
    .select('id, description, category, pkg_size, price, image_url, details', { count: 'exact' })
    .eq('is_active', true)
    .is('image_url', null)
    .is('freshop_id', null)
    .order('category')
    .order('description')
    .range(cursor, cursor + SCAN_PER_RUN - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []) as unknown as Row[];
  const started = Date.now();
  const proposals: Proposal[] = [];
  let scanned = 0;
  let rateLimited = false;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const batch = rows.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(r => findMatchFor(r.description, r.category, r.pkg_size, Number(r.price))),
    );

    for (let b = 0; b < batch.length; b++) {
      const { candidate, rateLimited: rl } = results[b];
      if (rl) { rateLimited = true; continue; }
      scanned++;
      if (candidate) {
        const r = batch[b];
        proposals.push({
          id: r.id,
          description: r.description,
          category: r.category,
          pkg_size: r.pkg_size,
          price: Number(r.price),
          current_details: r.details,
          candidate,
        });
      }
    }

    if (rateLimited) break;
    await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
  }

  const nextCursor = cursor + scanned;
  return NextResponse.json({
    proposals,
    scanned,
    /** Total active photo-less items with no UPC match — the whole job size. */
    total_missing: count ?? 0,
    cursor: nextCursor,
    has_more: !rateLimited && nextCursor < (count ?? 0),
    rate_limited: rateLimited,
  });
}
