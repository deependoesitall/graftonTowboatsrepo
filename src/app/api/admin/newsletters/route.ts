// src/app/api/admin/newsletters/route.ts
//
// List emails. GTS only. The announcement is one of these: its copy is
// 'branded', 'plain', or any newsletter, picked here.
//
// GET                   → { selected, newsletters }
// GET ?preview=<key>    → { subject, html, text }
// GET ?id=<id>          → { newsletter } with its blocks, for the builder
// POST { preview: {...} }      → render a draft, nothing saved
// POST { duplicate: id }       → a copy → { id }
// POST { copyLast: true }      → a copy of the newsletter sent most recently → { id }
// POST { name, subject, body, style }        → new → { id }
//   format:'blocks' with blocks (the email builder) and send_plain also accepted
// PUT  { id, name, subject, body, style }    → save changes (same extras)
// PATCH { selected }    → the copy used for announcement lists loaded from now on
// DELETE ?id=<id>       → delete (the announcement falls back to Branded if it used it)
import { NextRequest, NextResponse } from 'next/server';
import { requireEmailAccess } from '@/lib/admin-auth-server';
import { createServiceClient } from '@/lib/supabase/server';
import { renderNewsletter } from '@/lib/announcement-versions';
import { renderBlocks } from '@/lib/email-render';
import { docToText, isDoc } from '@/lib/email-blocks';
import { UUID, listNewsletters, loadAnnouncement, selectedVersionKey } from '@/lib/announcement-versions-server';

export const dynamic = 'force-dynamic';

const MAX_BODY = 100_000;

type Draft = { name: string; subject: string; body: string; style: 'plain' | 'branded'; format?: 'blocks'; blocks?: unknown; send_plain?: boolean };
function draft(d: Record<string, unknown>): Draft | string {
  const subject = String(d.subject ?? '').trim();
  const name = String(d.name ?? '').trim().slice(0, 80) || subject.slice(0, 80);
  if (d.format === 'blocks') {
    // Made in the email builder: the blocks are the email, `body` keeps its
    // words for search and the list.
    if (!isDoc(d.blocks) || d.blocks.blocks.length > 200) return 'That email could not be read.';
    if (JSON.stringify(d.blocks).length > 1_000_000) return 'That email is too long.';
    if (subject.length > 200) return 'That subject is too long.';
    return {
      name: name || 'Untitled email', subject, body: docToText(d.blocks).slice(0, MAX_BODY) || ' ',
      style: d.blocks.branded === false ? 'plain' : 'branded', format: 'blocks', blocks: d.blocks, send_plain: d.send_plain === true,
    };
  }
  const body = String(d.body ?? '');
  if (!subject) return 'Add a subject.';
  if (!body.trim()) return 'Add the email text.';
  if (subject.length > 200 || body.length > MAX_BODY) return 'That email is too long.';
  return {
    name, subject, body,
    style: d.style === 'branded' ? 'branded' : 'plain',
  };
}

async function settingsId(supabase: ReturnType<typeof createServiceClient>) {
  const { data } = await supabase.from('admin_settings').select('id').single();
  return data?.id as string | undefined;
}

export async function GET(req: NextRequest) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const supabase = createServiceClient();
  const preview = new URL(req.url).searchParams.get('preview');
  try {
    const one = new URL(req.url).searchParams.get('id');
    if (one) {
      if (!UUID.test(one)) return NextResponse.json({ error: 'Unknown newsletter' }, { status: 400 });
      const { data } = await supabase.from('newsletters').select('id, name, subject, body, style, format, blocks, send_plain, updated_at')
        .eq('id', one).eq('archived', false).maybeSingle();
      if (!data) return NextResponse.json({ error: 'That newsletter was deleted' }, { status: 404 });
      return NextResponse.json({ newsletter: data });
    }
    if (preview) {
      const { subject, html, text } = await loadAnnouncement(supabase, preview);
      return NextResponse.json({ subject, html, text });
    }
    const [selected, newsletters] = await Promise.all([selectedVersionKey(supabase), listNewsletters(supabase)]);
    return NextResponse.json({ selected, newsletters });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  const supabase = createServiceClient();
  const by = session.display_name || session.username;

  if (body.preview) {
    const d = draft(body.preview);
    if (typeof d === 'string') return NextResponse.json({ subject: '', html: '', text: '' });
    if (d.format === 'blocks' && isDoc(d.blocks)) return NextResponse.json(await renderBlocks(d.blocks, { subject: d.subject, plain: d.send_plain }));
    return NextResponse.json(renderNewsletter(d));
  }

  if (body.copyLast) {
    // The newsletter most recently sent to a list; if none was, the one
    // changed last.
    const { data: imps } = await supabase.from('email_imports').select('newsletter_key')
      .not('newsletter_key', 'is', null).order('created_at', { ascending: false }).limit(20);
    const sentIds = (imps || []).map((i) => String(i.newsletter_key)).filter((k) => UUID.test(k));
    let pick: string | null = null;
    if (sentIds.length) {
      const { data: live } = await supabase.from('newsletters').select('id').in('id', sentIds).eq('archived', false);
      const ok = new Set((live || []).map((r) => r.id as string));
      pick = sentIds.find((k) => ok.has(k)) || null;
    }
    if (!pick) {
      const { data: last } = await supabase.from('newsletters').select('id').eq('archived', false)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      pick = (last?.id as string | undefined) || null;
    }
    if (!pick) return NextResponse.json({ error: 'There is no earlier email to copy yet.' }, { status: 404 });
    body.duplicate = pick;
  }

  if (body.duplicate) {
    if (!UUID.test(String(body.duplicate))) return NextResponse.json({ error: 'Unknown newsletter' }, { status: 400 });
    const { data: src } = await supabase.from('newsletters')
      .select('name, subject, body, style, format, blocks, send_plain').eq('id', body.duplicate).maybeSingle();
    if (!src) return NextResponse.json({ error: 'Unknown newsletter' }, { status: 404 });
    const { data, error } = await supabase.from('newsletters')
      .insert({ ...src, name: `${src.name} (copy)`.slice(0, 80), created_by_name: by }).select('id').single();
    if (error || !data) return NextResponse.json({ error: error?.message || 'Could not copy' }, { status: 500 });
    return NextResponse.json({ id: data.id, name: `${src.name} (copy)`.slice(0, 80) });
  }

  const d = draft(body);
  if (typeof d === 'string') return NextResponse.json({ error: d }, { status: 400 });
  const { data, error } = await supabase.from('newsletters').insert({ ...d, created_by_name: by }).select('id').single();
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not save' }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function PUT(req: NextRequest) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  if (!UUID.test(String(body.id ?? ''))) return NextResponse.json({ error: 'Unknown newsletter' }, { status: 400 });
  const d = draft(body);
  if (typeof d === 'string') return NextResponse.json({ error: d }, { status: 400 });
  const { error } = await createServiceClient().from('newsletters')
    .update({ ...d, updated_at: new Date().toISOString() }).eq('id', body.id).eq('archived', false);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: body.id });
}

export async function PATCH(req: NextRequest) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const { selected } = await req.json().catch(() => ({}));
  const key = String(selected ?? '');
  if (key !== 'branded' && key !== 'plain' && !UUID.test(key)) {
    return NextResponse.json({ error: 'Unknown version' }, { status: 400 });
  }
  const supabase = createServiceClient();
  if (UUID.test(key)) {
    const { data } = await supabase.from('newsletters').select('id').eq('id', key).eq('archived', false).maybeSingle();
    if (!data) return NextResponse.json({ error: 'That newsletter was deleted' }, { status: 404 });
  }
  const id = await settingsId(supabase);
  if (!id) return NextResponse.json({ error: 'No admin settings row' }, { status: 500 });
  const { error } = await supabase.from('admin_settings').update({ announcement_version: key }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ selected: key });
}

export async function DELETE(req: NextRequest) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown newsletter' }, { status: 400 });
  const supabase = createServiceClient();
  // Kept as archived so sends already made still show what went out.
  await supabase.from('newsletters').update({ archived: true }).eq('id', id);
  if (await selectedVersionKey(supabase) === id) {
    const sid = await settingsId(supabase);
    if (sid) await supabase.from('admin_settings').update({ announcement_version: 'branded' }).eq('id', sid);
  }
  // Waiting sends of a deleted newsletter stop rather than fail every day.
  await supabase.from('email_imports').update({ status: 'cancelled' })
    .eq('newsletter_key', id).in('status', ['queued', 'paused']);
  await supabase.from('newsletter_schedules').delete().eq('newsletter_key', id);
  return NextResponse.json({ ok: true });
}
