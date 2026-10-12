// src/app/api/admin/email-imports/route.ts
//
// The announcement queue behind the Emails tab. GTS only.
//
// GET   → { settings: { sendTime, nextRunAt }, imports: [...] }
// GET ?progress=1 → every queued address with its status, and the account
//       it has made since, if any (matched on email, any case).
// POST  { emails, sendNow? } → load a list; with sendNow, what today's Resend
//       quota allows goes out now and the rest waits for the daily send.
// PATCH { sendTime: 'HH:MM' } → the daily send time (America/Chicago). Until
//       this is saved once, the queue sends nothing on its own.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { createServiceClient } from '@/lib/supabase/server';
import { getEmailQuota } from '@/lib/email-quota-server';
import { quotaRoom } from '@/lib/email-quota';
import { listAuthUsers } from '@/lib/auth-user-dates';
import { cleanAudience, resolveAudience } from '@/lib/contacts';
import {
  createImport, ctDay, ctTimeLabel, importNextRunAt, loadQueueSettings, nextRunAt, sendFromImports, slotAt,
} from '@/lib/email-queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();
  if (new URL(req.url).searchParams.get('progress')) return progress(supabase);
  const settings = await loadQueueSettings(supabase);
  const { data: imports, error } = await supabase.from('email_imports')
    .select('id, created_by_name, created_at, subject, total, sent_count, invalid, status, last_run_at, last_error, newsletter_key')
    .order('created_at', { ascending: false }).limit(25);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (imports || []).map((i) => i.id);
  const { data: counts } = ids.length
    ? await supabase.from('email_import_counts').select('*').in('import_id', ids)
    : { data: [] };
  const byId = new Map((counts || []).map((c) => [c.import_id as string, c]));

  return NextResponse.json({
    settings: {
      sendTime: settings.sendTime,
      nextRunAt: nextRunAt(settings)?.toISOString() ?? null,
    },
    imports: (imports || []).map((i) => {
      const c = byId.get(i.id) || {};
      const pending = Number((c as { pending?: number }).pending || 0);
      return {
        ...i,
        sent: Number((c as { sent?: number }).sent || 0),
        pending,
        skipped: Number((c as { skipped?: number }).skipped || 0),
        failed: Number((c as { failed?: number }).failed || 0),
        invalid_count: Array.isArray(i.invalid) ? i.invalid.length : 0,
        next_send_at: pending && (i.status === 'queued' || i.status === 'sending')
          ? importNextRunAt(settings, i.created_at)?.toISOString() ?? null
          : null,
      };
    }),
  });
}

async function progress(supabase: ReturnType<typeof createServiceClient>) {
  const rows: { email: string; status: string; sent_at: string | null; failed_at: string | null; error: string | null; import_id: string }[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supabase.from('email_import_recipients')
      .select('email, status, sent_at, failed_at, error, import_id').order('id').range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const accounts = new Map<string, string | null>();
  try {
    for (const u of await listAuthUsers(supabase)) if (u.email) accounts.set(u.email.toLowerCase(), u.created_at);
  } catch { /* show the list without accounts rather than nothing */ }
  return NextResponse.json({
    recipients: rows.map((r) => {
      const key = r.email.toLowerCase();
      return { ...r, has_account: accounts.has(key), signed_up_at: accounts.get(key) ?? null };
    }),
  });
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const supabase = createServiceClient();
  // A newsletter (or one announcement copy) goes to `audience`: the contact
  // list or part of it, an earlier send's list, or pasted addresses. A bare
  // pasted list is the announcement, in whichever copy is picked.
  const n = String(body.newsletter ?? '');
  const newsletterKey = UUID.test(n) || n === 'branded' || n === 'plain' ? n : 'announcement';
  let emails = body.emails;
  if (body.audience && typeof body.audience === 'object') {
    emails = await resolveAudience(supabase, cleanAudience(body.audience));
    if (!emails.length) return NextResponse.json({ error: 'Nobody matches that.' }, { status: 400 });
  }
  if (!(typeof emails === 'string' || Array.isArray(emails))) {
    return NextResponse.json({ error: 'No email addresses.' }, { status: 400 });
  }

  let created;
  try {
    created = await createImport(supabase, {
      emails,
      createdBy: UUID.test(session.sub) ? session.sub : null,
      createdByName: session.display_name || session.username,
      newsletterKey,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load the list' }, { status: 400 });
  }

  let sentNow = 0;
  let note: string | null = null;
  const apiKey = process.env.RESEND_API_KEY;
  if (body.sendNow === true && created.pending > 0) {
    if (!apiKey) {
      note = 'RESEND_API_KEY is not set, so nothing went out. The list is saved.';
    } else {
      try {
        const room = quotaRoom(await getEmailQuota(apiKey));
        const r = await sendFromImports(supabase, { apiKey, importIds: [created.id], budget: room ? room.left : null });
        sentNow = r.sent;
        if (r.error) note = `Stopped after ${r.sent}: ${r.error}. The rest are saved.`;
      } catch (e) {
        note = `Could not read what Resend has left (${e instanceof Error ? e.message : 'error'}). Nothing went out; the list is saved.`;
      }
    }
  }
  return NextResponse.json({ ok: true, ...created, sentNow, queued: created.pending - sentNow, note });
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  // Some browsers send seconds (08:00:00); the minute is what counts.
  const sendTime = typeof body.sendTime === 'string' ? body.sendTime.trim().slice(0, 5) : '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime)) {
    return NextResponse.json({ error: 'Pick a time, like 08:00.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const settings = await loadQueueSettings(supabase);
  const now = new Date();
  const today = ctDay(now);
  // Starts at the NEXT occurrence: a time already past today waits for
  // tomorrow instead of firing on the next ping.
  const passed = slotAt(today, sendTime) <= now;
  const lastRunOn = passed ? today : settings.lastRunOn;
  const { error } = await supabase.from('admin_settings')
    .update({ email_queue_send_time: sendTime, email_queue_last_run_on: lastRunOn })
    .eq('id', settings.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const next = nextRunAt({ sendTime, lastRunOn }, now)!;
  const day = next.toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'short', day: 'numeric' });
  return NextResponse.json({
    ok: true,
    sendTime,
    nextRunAt: next.toISOString(),
    message: `Saved. The queue will begin sending daily at ${ctTimeLabel(sendTime)} (America/Chicago), starting ${day} at ${ctTimeLabel(sendTime)}.`,
  });
}
