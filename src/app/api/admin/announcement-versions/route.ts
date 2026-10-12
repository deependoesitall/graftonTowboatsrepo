// src/app/api/admin/announcement-versions/route.ts
//
// Which announcement copy the queue sends. GTS only.
//
// GET                 → { selected, versions: [{ key, name, custom }] }
// GET ?preview=<key>  → { subject, html, text } for that version
// POST { name, subject, body, format } → a new custom version → { key }
// POST { preview: { subject, body, format } } → render a draft, nothing saved
// PATCH { selected }  → the version the queue sends from now on
// DELETE ?key=<id>    → archive a custom version (Branded takes over if it was selected)
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { createServiceClient } from '@/lib/supabase/server';
import { renderCustomVersion } from '@/lib/announcement-versions';
import {
  BUILT_IN, listCustomVersions, loadAnnouncement, selectedVersionKey,
} from '@/lib/announcement-versions-server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 100_000;

type Draft = { subject?: unknown; body?: unknown; format?: unknown };
function draft(d: Draft): { subject: string; body: string; format: 'text' | 'html' } | string {
  const subject = String(d.subject ?? '').trim();
  const body = String(d.body ?? '');
  const format = d.format === 'html' ? 'html' : 'text';
  if (!subject) return 'Add a subject.';
  if (!body.trim()) return 'Add the email text.';
  if (subject.length > 200 || body.length > MAX_BODY) return 'That email is too long.';
  return { subject, body, format };
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;
  const supabase = createServiceClient();
  const preview = new URL(req.url).searchParams.get('preview');
  if (preview) {
    const { subject, html, text } = await loadAnnouncement(supabase, preview);
    return NextResponse.json({ subject, html, text });
  }
  try {
    const [selected, custom] = await Promise.all([selectedVersionKey(supabase), listCustomVersions(supabase)]);
    return NextResponse.json({
      selected,
      versions: [
        ...BUILT_IN.map((v) => ({ key: v.key, name: v.name, custom: false })),
        ...custom.map((v) => ({ key: v.id, name: v.name, custom: true })),
      ],
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load versions' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));

  if (body.preview) {
    const d = draft(body.preview);
    if (typeof d === 'string') return NextResponse.json({ subject: '', html: '', text: '' });
    return NextResponse.json(renderCustomVersion(d));
  }

  const d = draft(body);
  if (typeof d === 'string') return NextResponse.json({ error: d }, { status: 400 });
  const name = String(body.name ?? '').trim().slice(0, 80) || d.subject.slice(0, 80);
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('email_announcement_versions').insert({
    name, subject: d.subject, body: d.body, format: d.format,
    created_by_name: session.display_name || session.username,
  }).select('id').single();
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not save' }, { status: 500 });
  return NextResponse.json({ key: data.id });
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;
  const { selected } = await req.json().catch(() => ({}));
  const key = String(selected ?? '');
  if (key !== 'branded' && key !== 'plain' && !UUID.test(key)) {
    return NextResponse.json({ error: 'Unknown version' }, { status: 400 });
  }
  const supabase = createServiceClient();
  if (UUID.test(key)) {
    const { data } = await supabase.from('email_announcement_versions').select('id').eq('id', key).eq('archived', false).maybeSingle();
    if (!data) return NextResponse.json({ error: 'That version was deleted' }, { status: 404 });
  }
  const { data: row } = await supabase.from('admin_settings').select('id').single();
  if (!row) return NextResponse.json({ error: 'No admin settings row' }, { status: 500 });
  const { error } = await supabase.from('admin_settings').update({ announcement_version: key }).eq('id', row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ selected: key });
}

export async function DELETE(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;
  const key = new URL(req.url).searchParams.get('key') || '';
  if (!UUID.test(key)) return NextResponse.json({ error: 'Only your own versions can be deleted' }, { status: 400 });
  const supabase = createServiceClient();
  await supabase.from('email_announcement_versions').update({ archived: true }).eq('id', key);
  if (await selectedVersionKey(supabase) === key) {
    const { data: row } = await supabase.from('admin_settings').select('id').single();
    if (row) await supabase.from('admin_settings').update({ announcement_version: 'branded' }).eq('id', row.id);
  }
  return NextResponse.json({ ok: true });
}
