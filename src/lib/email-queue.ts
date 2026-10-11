// src/lib/email-queue.ts
//
// The announcement queue. Jen pastes a list once; what today's Resend quota
// allows goes out when she taps Send, the rest waits in email_import_recipients
// and goes out a day at a time at the send time she sets on the Emails tab.
// The daily run is /api/cron/email-queue, pinged by pg_cron every 15 minutes.
//
// ⚠️ NO SEND TIME, NO SENDING. email_queue_send_time is NULL until Jen saves
// one, and the daily run does nothing while it is. There is no default.
//
// Server only (service role).
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/server';
import { buildAnnouncementEmail } from '@/lib/customer-emails';
import { BCC_PER_EMAIL, addressesThatFit, announcementCost } from '@/lib/email-quota';
import { listAuthUsers } from '@/lib/auth-user-dates';
import { parseEmailList } from '@/lib/email-address';

type Supa = ReturnType<typeof createServiceClient>;

export const TZ = 'America/Chicago';
/** Resend's batch endpoint takes up to 100 emails per call. */
const EMAILS_PER_BATCH = 100;
/** A run that died mid-send frees its import after this long. */
const STALE_LOCK_MS = 10 * 60 * 1000;
/** Upper bound per run when the plan reports no limit. */
const UNLIMITED_RUN_CAP = 1000;

// ── Chicago time, DST-aware ─────────────────────────────────────────────

function parts(d: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

/** Chicago calendar day, YYYY-MM-DD. */
export function ctDay(d: Date): string {
  const p = parts(d);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The instant `hm` (HH:MM) happens on Chicago day `day`. */
export function slotAt(day: string, hm: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let t = wall;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(t));
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    t += wall - shown;
  }
  return new Date(t);
}

/** "HH:MM" from a Postgres time ("08:00:00"), or null. */
export function hhmm(raw: unknown): string | null {
  return typeof raw === 'string' && /^\d{2}:\d{2}/.test(raw) ? raw.slice(0, 5) : null;
}

export function ctTimeLabel(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} CT`;
}

export type QueueSettings = { sendTime: string | null; lastRunOn: string | null };

/** When the daily run will next send, or null with no send time set. */
export function nextRunAt(s: QueueSettings, now = new Date()): Date | null {
  if (!s.sendTime) return null;
  const today = ctDay(now);
  if (s.lastRunOn !== today) return slotAt(today, s.sendTime); // may be just past: next ping
  return slotAt(addDays(today, 1), s.sendTime);
}

/** When an import created at `createdAt` will next get a batch. An import only
 *  joins daily runs whose time is after it was made. */
export function importNextRunAt(s: QueueSettings, createdAt: string, now = new Date()): Date | null {
  const next = nextRunAt(s, now);
  if (!next || !s.sendTime) return null;
  let day = ctDay(next);
  while (slotAt(day, s.sendTime).getTime() <= Date.parse(createdAt)) day = addDays(day, 1);
  return slotAt(day, s.sendTime);
}

// ── Creating an import ──────────────────────────────────────────────────

async function sentBefore(supabase: Supa, emails: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data, error } = await supabase
      .from('email_import_recipients').select('email')
      .eq('status', 'sent').in('email', emails.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const r of data || []) out.add(String(r.email).toLowerCase());
  }
  return out;
}

async function accountEmails(supabase: Supa): Promise<Set<string>> {
  const users = await listAuthUsers(supabase);
  return new Set(users.map((u) => (u.email || '').toLowerCase()).filter(Boolean));
}

export type CreatedImport = {
  id: string; total: number; pending: number; skipped: number; invalid: number;
};

export async function createImport(supabase: Supa, opts: {
  emails: string | string[]; createdBy: string | null; createdByName: string;
}): Promise<CreatedImport> {
  const raw = Array.isArray(opts.emails) ? opts.emails.join('\n') : opts.emails;
  const { valid, invalid } = parseEmailList(raw);
  if (!valid.length) throw new Error('No valid email addresses.');

  const [already, accounts] = await Promise.all([sentBefore(supabase, valid), accountEmails(supabase)]);
  const { subject } = buildAnnouncementEmail();

  const { data: imp, error } = await supabase.from('email_imports').insert({
    created_by: opts.createdBy,
    created_by_name: opts.createdByName,
    template: 'announcement',
    subject,
    total: valid.length,
    invalid,
    status: 'queued',
  }).select('id').single();
  if (error || !imp) throw new Error(error?.message || 'Could not create the import');

  const rows = [
    ...valid.map((email) => (
      accounts.has(email) ? { import_id: imp.id, email, status: 'skipped', error: 'Already has an account' }
      : already.has(email) ? { import_id: imp.id, email, status: 'skipped', error: 'Already sent the announcement' }
      : { import_id: imp.id, email, status: 'pending', error: null }
    )),
    ...invalid.map((email) => ({ import_id: imp.id, email, status: 'invalid', error: 'Not an email address' })),
  ];
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e } = await supabase.from('email_import_recipients').insert(rows.slice(i, i + 500));
    if (e) {
      await supabase.from('email_imports').delete().eq('id', imp.id);
      throw new Error(e.message);
    }
  }
  const pending = rows.filter((r) => r.status === 'pending').length;
  if (!pending) await supabase.from('email_imports').update({ status: 'done' }).eq('id', imp.id);
  return {
    id: imp.id, total: valid.length, pending,
    skipped: rows.filter((r) => r.status === 'skipped').length, invalid: invalid.length,
  };
}

// ── Sending ─────────────────────────────────────────────────────────────

export function senderFor(gtsInbox: string): { from: string; replyTo: string } {
  const fromAddr = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const from = fromAddr.includes('<') ? fromAddr : `Grafton Towboat Services <${fromAddr}>`;
  return { from, replyTo: gtsInbox };
}

export async function gtsInboxFor(supabase: Supa): Promise<string> {
  const { data } = await supabase.from('admin_settings').select('business_email').single();
  return data?.business_email || process.env.BUSINESS_EMAIL || 'GraftonTowboatServices@gmail.com';
}

async function refreshImport(supabase: Supa, id: string): Promise<number> {
  const count = async (status: string) => {
    const { count: n } = await supabase.from('email_import_recipients')
      .select('id', { count: 'exact', head: true }).eq('import_id', id).eq('status', status);
    return n || 0;
  };
  const [sent, pending] = await Promise.all([count('sent'), count('pending')]);
  await supabase.from('email_imports').update({ sent_count: sent }).eq('id', id);
  return pending;
}

export type SendResult = { sent: number; cost: number; skipped: number; error: string | null; perImport: Record<string, number> };

/**
 * Send pending addresses from `importIds`, oldest first, within `budget`
 * Resend emails (null = no limit reported). Each import is locked by moving
 * it to 'sending' first, so two runs can never send the same import at once.
 * Every address is marked sent as soon as its batch is accepted.
 */
export async function sendFromImports(supabase: Supa, opts: {
  apiKey: string; importIds: string[]; budget: number | null;
}): Promise<SendResult> {
  const res: SendResult = { sent: 0, cost: 0, skipped: 0, error: null, perImport: {} };
  let left = opts.budget == null ? announcementCost(UNLIMITED_RUN_CAP) : opts.budget;
  if (!opts.importIds.length || addressesThatFit(left) < 1) return res;

  const resend = new Resend(opts.apiKey);
  const { subject, html } = buildAnnouncementEmail();
  const { from, replyTo } = senderFor(await gtsInboxFor(supabase));
  let accounts: Set<string> | null = null;

  for (const id of opts.importIds) {
    if (addressesThatFit(left) < 1 || res.error) break;
    const nowIso = new Date().toISOString();
    const stale = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data: locked } = await supabase.from('email_imports')
      .update({ status: 'sending', last_run_at: nowIso })
      .eq('id', id)
      .or(`status.eq.queued,and(status.eq.sending,last_run_at.lt."${stale}")`)
      .select('id');
    if (!locked?.length) continue;

    let sentHere = 0;
    let importError: string | null = null;
    try {
      // Up to three passes, so addresses skipped at send time free their room.
      for (let pass = 0; pass < 3 && !importError; pass++) {
        const want = addressesThatFit(left);
        if (want < 1) break;
        const { data: rows, error } = await supabase.from('email_import_recipients')
          .select('id, email').eq('import_id', id).eq('status', 'pending')
          .order('id').limit(Math.min(want, 1000));
        if (error) { importError = error.message; break; }
        if (!rows?.length) break;

        // Someone may have made an account, or been sent it from another
        // import, since this list was loaded.
        accounts = accounts || await accountEmails(supabase);
        const already = await sentBefore(supabase, rows.map((r) => r.email));
        const skip = rows.filter((r) => accounts!.has(r.email) || already.has(r.email));
        for (const r of skip) {
          await supabase.from('email_import_recipients').update({
            status: 'skipped',
            error: accounts!.has(r.email) ? 'Already has an account' : 'Already sent the announcement',
          }).eq('id', r.id).eq('status', 'pending');
        }
        res.skipped += skip.length;
        const go = rows.filter((r) => !skip.includes(r));
        if (!go.length) continue;

        const groups: { id: number; email: string }[][] = [];
        for (let i = 0; i < go.length; i += BCC_PER_EMAIL) groups.push(go.slice(i, i + BCC_PER_EMAIL));
        for (let i = 0; i < groups.length; i += EMAILS_PER_BATCH) {
          if (i > 0) await new Promise((r) => setTimeout(r, 250));
          const chunk = groups.slice(i, i + EMAILS_PER_BATCH);
          const r = await resend.batch.send(
            chunk.map((g) => ({ from, to: [replyTo], bcc: g.map((x) => x.email), replyTo, subject, html })),
            { idempotencyKey: `gts-import-${id}-${chunk[0][0].id}-${chunk.flat().length}` },
          );
          if (r.error) { importError = r.error.message || JSON.stringify(r.error); break; }
          const ids = chunk.flat().map((x) => x.id);
          const at = new Date().toISOString();
          for (let j = 0; j < ids.length; j += 200) {
            await supabase.from('email_import_recipients')
              .update({ status: 'sent', sent_at: at, error: null }).in('id', ids.slice(j, j + 200));
          }
          const n = ids.length;
          const cost = announcementCost(n);
          left -= cost; res.cost += cost; res.sent += n; sentHere += n;
        }
      }
    } catch (e) {
      importError = e instanceof Error ? e.message : 'Send failed';
    } finally {
      const pending = await refreshImport(supabase, id);
      await supabase.from('email_imports').update({
        status: pending ? 'queued' : 'done',
        last_error: importError,
        last_run_at: new Date().toISOString(),
      }).eq('id', id).eq('status', 'sending'); // a Pause or Cancel during the run wins
      res.perImport[id] = sentHere;
      if (importError) res.error = importError;
    }
  }
  return res;
}

export async function loadQueueSettings(supabase: Supa): Promise<QueueSettings & { id: string }> {
  const { data, error } = await supabase.from('admin_settings')
    .select('id, email_queue_send_time, email_queue_last_run_on').single();
  if (error || !data) throw new Error(error?.message || 'No admin settings row');
  return {
    id: data.id as string,
    sendTime: hhmm(data.email_queue_send_time),
    lastRunOn: (data.email_queue_last_run_on as string | null) ?? null,
  };
}
