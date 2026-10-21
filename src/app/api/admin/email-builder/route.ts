// src/app/api/admin/email-builder/route.ts
//
// The email builder's server side. GTS only.
//
// POST multipart { action:'import', file(s) | html }  → an outside email as blocks
//   (.html, .htm, a .zip with its pictures, or pictures sent with it)
// POST multipart { action:'image', file }              → { url } (hosted picture)
// POST { action:'render', doc, subject, plain }        → { subject, html, text, bytes }
// POST { action:'check', doc, subject, plain }         → { problems }
// POST { action:'test', id }                           → "Send me one first": the real
//   message (unsubscribe included) to the GTS inbox
// GET  ?stats=<newsletter key>                         → { sends: SendStats[] }
// GET  ?csv=<import id>                                → CSV of that send
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { unzipSync } from 'fflate';
import { requireEmailAccess } from '@/lib/admin-auth-server';
import { createServiceClient } from '@/lib/supabase/server';
import { importHtml } from '@/lib/email-import';
import { hostDocImages, supabaseImageStore, MAX_IMAGE_BYTES, type ImportFile } from '@/lib/email-images';
import { renderBlocks } from '@/lib/email-render';
import { checkEmail } from '@/lib/email-check';
import { isDoc, type EmailDoc } from '@/lib/email-blocks';
import { withUnsubscribe } from '@/lib/announcement-versions';
import { UUID, loadAnnouncement } from '@/lib/announcement-versions-server';
import { listMessage } from '@/lib/list-email';
import { gtsInboxFor, senderFor } from '@/lib/email-queue';
import { loadStats, statsCsv } from '@/lib/email-stats';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_UPLOAD = 20 * 1024 * 1024;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;
const SAMPLE_UNSUB = 'https://graftontowboatservices.com/api/unsubscribe';

const err = (error: string, status = 400) => NextResponse.json({ error }, { status });
const typeOf = (name: string) => ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' } as Record<string, string>)[name.split('.').pop()!.toLowerCase()] || '';

async function readUpload(form: FormData): Promise<{ html: string; files: ImportFile[] } | string> {
  let html = String(form.get('html') || '');
  const files: ImportFile[] = [];
  let total = 0;
  for (const v of form.getAll('file')) {
    if (typeof v === 'string') continue;
    const bytes = new Uint8Array(await v.arrayBuffer());
    total += bytes.length;
    if (total > MAX_UPLOAD) return 'Those files are over 20 MB together.';
    const name = v.name || 'file';
    if (/\.zip$/i.test(name)) {
      let entries: Record<string, Uint8Array>;
      try { entries = unzipSync(bytes); } catch { return 'That .zip file could not be opened.'; }
      for (const [path, data] of Object.entries(entries)) {
        if (path.startsWith('__MACOSX/') || !data.length) continue;
        if (/\.html?$/i.test(path) && !html) html = new TextDecoder().decode(data);
        else if (IMAGE_EXT.test(path) && data.length <= MAX_IMAGE_BYTES) files.push({ name: path, type: typeOf(path), bytes: data });
      }
    } else if (/\.html?$/i.test(name) || v.type === 'text/html') {
      if (!html) html = new TextDecoder().decode(bytes);
    } else if (IMAGE_EXT.test(name) || /^image\//.test(v.type)) {
      files.push({ name, type: v.type || typeOf(name), bytes });
    }
  }
  if (!html.trim()) return 'Paste the email, or pick its .html file.';
  if (html.length > 2_000_000) return 'That email is too big to bring in.';
  return { html, files };
}

function docFrom(v: unknown): EmailDoc | null {
  return isDoc(v) && v.blocks.length <= 200 ? v : null;
}

export async function POST(req: NextRequest) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const supabase = createServiceClient();
  const isForm = (req.headers.get('content-type') || '').includes('multipart/form-data');

  try {
    if (isForm) {
      const form = await req.formData();
      const action = String(form.get('action') || '');
      const store = supabaseImageStore(supabase);
      if (action === 'image') {
        const f = form.get('file');
        if (!f || typeof f === 'string') return err('Pick a picture.');
        const bytes = new Uint8Array(await f.arrayBuffer());
        if (bytes.length > MAX_IMAGE_BYTES) return err('That picture is over 5 MB.');
        return NextResponse.json({ url: await store.put(bytes, f.type || typeOf(f.name)) });
      }
      if (action === 'import') {
        const up = await readUpload(form);
        if (typeof up === 'string') return err(up);
        const r = importHtml(up.html);
        const hosted = await hostDocImages(r.doc, { store, files: up.files });
        return NextResponse.json({ doc: hosted.doc, mode: r.mode, removed: r.removed, subject: r.subject || null, hosted: hosted.hosted, missing: hosted.missing, failed: hosted.failed });
      }
      return err('Unknown action');
    }

    const body = await req.json().catch(() => ({}));
    if (body.action === 'render' || body.action === 'check') {
      const doc = docFrom(body.doc);
      if (!doc) return err('Nothing to show yet.');
      const subject = String(body.subject || '');
      const e = await renderBlocks(doc, { subject, plain: body.plain === true });
      // The preview carries the unsubscribe line every reader gets.
      const shown = withUnsubscribe(e, SAMPLE_UNSUB);
      const bytes = Buffer.byteLength(shown.html, 'utf8');
      if (body.action === 'render') return NextResponse.json({ ...shown, bytes });
      return NextResponse.json({ problems: await checkEmail(doc, { subject, html: shown.html }), bytes });
    }

    if (body.action === 'test') {
      const id = String(body.id || '');
      if (!UUID.test(id) && id !== 'branded' && id !== 'plain') return err('Save the email first.');
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) return err('RESEND_API_KEY is not set.', 500);
      const email = await loadAnnouncement(supabase, id);
      const to = await gtsInboxFor(supabase);
      // Exactly what a reader gets: built by the same code the send uses,
      // with the unsubscribe link and headers made for this inbox.
      const m = listMessage(email, to, { key: id });
      const { from, replyTo } = senderFor(to);
      const r = await new Resend(apiKey).emails.send({ from, to: [to], replyTo, subject: m.subject, html: m.html, text: m.text, headers: m.headers, tags: m.tags });
      if (r.error) return err(r.error.message || 'Could not send', 502);
      return NextResponse.json({ ok: true, to });
    }
    return err('Unknown action');
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Something went wrong', 500);
  }
}

export async function GET(req: NextRequest) {
  const session = requireEmailAccess(req);
  if (session instanceof NextResponse) return session;
  const supabase = createServiceClient();
  const u = new URL(req.url);
  try {
    const csv = u.searchParams.get('csv');
    if (csv) {
      if (!UUID.test(csv)) return err('Unknown send');
      return new NextResponse(await statsCsv(supabase, csv), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="email-stats-${csv.slice(0, 8)}.csv"` },
      });
    }
    const key = u.searchParams.get('stats');
    const sends = await loadStats(supabase, { key: key && key !== 'all' ? key : null, limit: 12 });
    return NextResponse.json({ sends });
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Could not load', 500);
  }
}
