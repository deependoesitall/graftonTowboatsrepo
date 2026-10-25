// src/app/api/admin/newsletter-schedules/route.ts
//
// Later and repeating sends of a newsletter. GTS only. The email-queue job
// sends them; see src/lib/newsletter-schedules.ts.
//
// GET                                   → { schedules }
// POST { newsletter, audience, kind, date: 'YYYY-MM-DD', time: 'HH:MM' } (Chicago) → { id }
// PATCH { id, paused }                  → pause / resume
// DELETE ?id=<id>                       → stop it for good
import { NextRequest, NextResponse } from 'next/server';
import { requireEmailAccess } from '@/lib/admin-auth-server';
import { createServiceClient } from '@/lib/supabase/server';
import { UUID } from '@/lib/announcement-versions-server';
import { cleanAudience } from '@/lib/contacts';
import { hhmm, slotAt } from '@/lib/email-queue';
import { KINDS, nextAfter, type ScheduleKind } from '@/lib/newsletter-schedules';

export const dynamic = 'force-dynamic';

const validKey = (k: string) => UUID.test(k) || k === 'branded' || k === 'plain';

export async function GET(req: NextRequest) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const { data, error } = await createServiceClient().from('newsletter_schedules')
    .select('id, newsletter_key, audience, kind, next_at, paused, last_sent_at, last_import_id, last_error, created_by_name')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedules: data || [] });
}

export async function POST(req: NextRequest) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  const key = String(body.newsletter ?? '');
  if (!validKey(key)) return NextResponse.json({ error: 'Pick a newsletter.' }, { status: 400 });
  const kind = String(body.kind) as ScheduleKind;
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Pick when it goes out.' }, { status: 400 });
  const time = hhmm(body.time);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date ?? '')) ? String(body.date) : null;
  if (!date || !time) return NextResponse.json({ error: 'Pick a day and a time.' }, { status: 400 });
  let at = slotAt(date, time);
  if (at <= new Date()) {
    if (kind === 'once') return NextResponse.json({ error: 'That time has passed. Pick a later one.' }, { status: 400 });
    at = nextAfter(kind, at)!;
  }
  const { data, error } = await createServiceClient().from('newsletter_schedules').insert({
    newsletter_key: key, audience: cleanAudience(body.audience), kind,
    next_at: at.toISOString(), created_by_name: session.display_name || session.username,
  }).select('id, next_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  if (!UUID.test(id) || typeof body.paused !== 'boolean') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const supabase = createServiceClient();
  const { data: s } = await supabase.from('newsletter_schedules').select('kind, next_at').eq('id', id).maybeSingle();
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const patch: Record<string, unknown> = { paused: body.paused };
  // Resuming after a missed date picks up at the next one, not a backlog.
  if (!body.paused && s.next_at && new Date(s.next_at) <= new Date() && s.kind !== 'once') {
    patch.next_at = nextAfter(s.kind as ScheduleKind, new Date(s.next_at))!.toISOString();
  }
  const { error } = await supabase.from('newsletter_schedules').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  await createServiceClient().from('newsletter_schedules').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
