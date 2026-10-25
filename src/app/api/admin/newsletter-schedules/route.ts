// src/app/api/admin/newsletter-schedules/route.ts
//
// Later and repeating sends of a newsletter. GTS only. The email-queue job
// sends them; see src/lib/newsletter-schedules.ts.
//
// GET                                   → { schedules, subscribedCount, queueSendTime }
// POST { newsletter, audience, kind, date: 'YYYY-MM-DD', time: 'HH:MM' } (Chicago) → { id }
// PATCH { id, paused } | { id, date, time? } | { moves: [{ id, date, time? }] } → pause / resume / reschedule
// DELETE ?id=<id>                       → stop it for good
import { NextRequest, NextResponse } from 'next/server';
import { requireEmailAccess } from '@/lib/admin-auth-server';
import { createServiceClient } from '@/lib/supabase/server';
import { UUID } from '@/lib/announcement-versions-server';
import { allContacts, cleanAudience, matches, resolveAudience } from '@/lib/contacts';
import { hhmm, loadQueueSettings, slotAt } from '@/lib/email-queue';
import { ctHm, KINDS, nextAfter, type ScheduleKind } from '@/lib/newsletter-schedules';

export const dynamic = 'force-dynamic';

const validKey = (k: string) => UUID.test(k) || k === 'branded' || k === 'plain';

export async function GET(req: NextRequest) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const supabase = createServiceClient();
  const [{ data, error }, contacts, settings] = await Promise.all([
    supabase.from('newsletter_schedules')
      .select('id, newsletter_key, audience, kind, next_at, paused, last_sent_at, last_import_id, last_error, created_by_name')
      .order('next_at', { ascending: true }),
    allContacts(supabase).catch(() => []),
    loadQueueSettings(supabase).catch(() => ({ sendTime: '08:30', lastRunOn: null })),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const subscribed = contacts.filter((c) => c.status === 'subscribed');
  const schedules = await Promise.all((data || []).map(async (s) => {
    const aud = cleanAudience(s.audience);
    let recipient_count = subscribed.length;
    if (aud.emails) recipient_count = aud.emails.split(/[\s,;]+/).filter((x) => x.includes('@')).length;
    else if (aud.fromImport) {
      const list = await resolveAudience(supabase, aud).catch(() => []);
      recipient_count = list.length;
    } else if (aud.company || aud.source || aud.account || aud.q) {
      recipient_count = subscribed.filter((c) => matches(c, aud)).length;
    }
    return { ...s, recipient_count };
  }));
  return NextResponse.json({
    schedules,
    subscribedCount: subscribed.length,
    queueSendTime: settings.sendTime || '08:30',
  });
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
  const supabase = createServiceClient();

  if (Array.isArray(body.moves) && body.moves.length > 0) {
    for (const m of body.moves) {
      const mid = String(m?.id ?? '');
      const mdate = /^\d{4}-\d{2}-\d{2}$/.test(String(m?.date ?? '')) ? String(m.date) : null;
      if (!UUID.test(mid) || !mdate) return NextResponse.json({ error: 'Bad move request' }, { status: 400 });
      const { data: row } = await supabase.from('newsletter_schedules').select('next_at').eq('id', mid).maybeSingle();
      if (!row) continue;
      const mtime = hhmm(m?.time) || (row.next_at ? ctHm(new Date(row.next_at as string)) : '10:00');
      const nextAt = slotAt(mdate, mtime);
      const { error } = await supabase.from('newsletter_schedules').update({ next_at: nextAt.toISOString() }).eq('id', mid);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const id = String(body.id ?? '');
  if (!UUID.test(id)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { data: s } = await supabase.from('newsletter_schedules').select('kind, next_at').eq('id', id).maybeSingle();
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (typeof body.paused === 'boolean') {
    patch.paused = body.paused;
    // Resuming after a missed date picks up at the next one, not a backlog.
    if (!body.paused && s.next_at && new Date(s.next_at) <= new Date() && s.kind !== 'once') {
      patch.next_at = nextAfter(s.kind as ScheduleKind, new Date(s.next_at))!.toISOString();
    }
  }
  if (typeof body.date === 'string') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
    const time = hhmm(body.time) || (s.next_at ? ctHm(new Date(s.next_at as string)) : '10:00');
    if (!date || !time) return NextResponse.json({ error: 'Pick a valid day and time.' }, { status: 400 });
    const nextAt = slotAt(date, time);
    if (nextAt <= new Date() && s.kind === 'once') {
      return NextResponse.json({ error: 'That time has passed. Pick a later one.' }, { status: 400 });
    }
    patch.next_at = nextAt.toISOString();
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const { error } = await supabase.from('newsletter_schedules').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, next_at: patch.next_at });
}

export async function DELETE(req: NextRequest) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  await createServiceClient().from('newsletter_schedules').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
