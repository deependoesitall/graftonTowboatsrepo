// src/app/api/admin/email-imports/[id]/route.ts
//
// GET   → the addresses in one import that did not or will not go out
//         (skipped, invalid, failed), for the expandable lists.
// PATCH { action: 'pause' | 'resume' | 'cancel' }
import { NextRequest, NextResponse } from 'next/server';
import { requireEmailAccess } from '@/lib/admin-auth-server';
import { createServiceClient } from '@/lib/supabase/server';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;

  const supabase = createServiceClient();
  const rows: { email: string; status: string; error: string | null }[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from('email_import_recipients')
      .select('email, status, error').eq('import_id', id).in('status', ['skipped', 'invalid', 'failed'])
      .order('id').range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return NextResponse.json({ rows });
}

const MOVES: Record<string, { from: string[]; to: string }> = {
  pause:  { from: ['queued', 'sending'], to: 'paused' },
  resume: { from: ['paused'], to: 'queued' },
  cancel: { from: ['queued', 'sending', 'paused'], to: 'cancelled' },
};

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const move = MOVES[String(body.action)];
  if (!move) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('email_imports')
    .update({ status: move.to }).eq('id', id).in('status', move.from).select('id, status');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'That list can’t do that now.' }, { status: 409 });
  return NextResponse.json({ ok: true, status: move.to });
}
