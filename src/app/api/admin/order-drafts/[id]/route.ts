// src/app/api/admin/order-drafts/[id]/route.ts
//
// One draft: read it, save over it, mark it placed, or throw it away.
//
// ⚠️ SAVING IS NOT MERGING. PATCH replaces `state` wholesale with what the
// builder currently holds, because the builder is the only thing that
// understands the shape and a half-merged draft is worse than either version.
// That makes last-write-wins the rule, which matters when two people have the
// same draft open — hence `updated_by` and `updated_at`, which the builder
// shows so the second person can see they are not alone in there.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await ctx.params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('order_drafts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'That draft is no longer there.' }, { status: 404 });
  return NextResponse.json({ draft: data });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const who = session.display_name || session.username || 'Staff';

  const updates: Record<string, unknown> = {
    updated_by: who,
    updated_at: new Date().toISOString(),
  };
  if (body.company_name !== undefined) updates.company_name = String(body.company_name).slice(0, 200);
  if (body.vessel_name !== undefined) updates.vessel_name = String(body.vessel_name).slice(0, 200);
  if (body.line_count !== undefined) updates.line_count = Number(body.line_count) || 0;
  if (body.subtotal !== undefined) updates.subtotal = Number(body.subtotal) || 0;
  if (body.state !== undefined && body.state && typeof body.state === 'object') updates.state = body.state;

  // Closing the draft out. 'placed' keeps the row on purpose: if someone else
  // still has this draft open, they need to be told the order has already gone
  // out, and a deleted row cannot tell them anything.
  if (body.status === 'placed' || body.status === 'discarded') {
    updates.status = body.status;
    if (body.status === 'placed') {
      updates.placed_at = new Date().toISOString();
      if (body.order_id) updates.order_id = String(body.order_id);
    }
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('order_drafts')
    .update(updates)
    .eq('id', id)
    .select('id, updated_at, updated_by, status')
    .maybeSingle();

  if (error) {
    console.warn('[order-drafts] save failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'That draft is no longer there.' }, { status: 404 });
  return NextResponse.json({ draft: data });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await ctx.params;
  const supabase = createServiceClient();
  // Marked, not removed — see the note on 'placed' above, and because a draft
  // someone spent twenty minutes on should be recoverable by hand if it is
  // thrown away by accident.
  const { error } = await supabase
    .from('order_drafts')
    .update({ status: 'discarded', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
