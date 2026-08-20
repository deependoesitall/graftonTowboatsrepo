// src/app/api/admin/photo-review/route.ts
// The Photo Review queue — matches the nightly sync found but wasn't confident
// enough to auto-apply. A human approves (applies the photo + name) or rejects.
//
// GET  — list pending proposals (best matches first)
// POST — { approve: [{ id, keepName }], reject: [id, ...] }

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products' });
  if (session instanceof NextResponse) return session;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('products')
    .select('id, description, details, category, pkg_size, price, proposed_image_url, proposed_details, proposed_name, proposed_score, proposed_image_borrowed')
    .not('proposed_image_url', 'is', null)
    .order('proposed_score', { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposals: data || [], count: (data || []).length });
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;
  const { approve = [], reject = [] } = await req.json();
  const supabase = createServiceClient();

  let approved = 0, rejected = 0;

  // Approve: pull the proposal onto the live fields, then clear the proposal.
  for (const a of approve as Array<{ id: string; keepName?: boolean }>) {
    if (!a?.id) continue;
    const { data: p } = await supabase
      .from('products')
      .select('proposed_image_url, proposed_details, manual_fields, proposed_image_borrowed')
      .eq('id', a.id).single();
    if (!p?.proposed_image_url) continue;
    const locked = new Set((p.manual_fields as string[]) || []);
    const upd: Record<string, unknown> = {
      // Distinguish a photo of the item itself from one borrowed off a similar
      // listing — a human approved both, but only one is literally this product.
      image_source: p.proposed_image_borrowed ? 'name_match_similar' : 'name_match',
      proposed_image_url: null, proposed_details: null, proposed_name: null, proposed_score: null,
      proposed_image_borrowed: false,
    };
    if (!locked.has('image_url')) upd.image_url = p.proposed_image_url;
    if (a.keepName !== false && p.proposed_details && !locked.has('details')) upd.details = p.proposed_details;
    const { error } = await supabase.from('products').update(upd).eq('id', a.id);
    if (!error) approved++;
  }

  // Reject: clear the proposal. photo_match_tried_at stays set, so the nightly
  // sync won't re-propose the same item for another 14 days.
  if (Array.isArray(reject) && reject.length) {
    const { error } = await supabase.from('products')
      .update({
        proposed_image_url: null, proposed_details: null, proposed_name: null,
        proposed_score: null, proposed_image_borrowed: false,
      })
      .in('id', reject);
    if (!error) rejected = reject.length;
  }

  return NextResponse.json({ success: true, approved, rejected });
}
