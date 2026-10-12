// src/lib/newsletter-schedules.ts
// "Send on a date" and "every week / every other week" for a newsletter.
// The email-queue job (pg_cron, every 15 min) calls runDueSchedules: each due
// schedule becomes an ordinary send in the daily-limited queue, sends what
// today's Resend room allows, and moves on to its next date (or ends).
import { createServiceClient } from '@/lib/supabase/server';
import { addDays, createImport, ctDay, sendFromImports, slotAt, TZ } from '@/lib/email-queue';
import { cleanAudience, resolveAudience } from '@/lib/contacts';

type Supa = ReturnType<typeof createServiceClient>;
export type ScheduleKind = 'once' | 'weekly' | 'biweekly';
export const KINDS: ScheduleKind[] = ['once', 'weekly', 'biweekly'];

/** Chicago wall clock "HH:MM" of an instant. */
export function ctHm(d: Date): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

/** The next time after `now`, same weekday and Chicago clock time as `at`
 *  (so 8:00 AM stays 8:00 AM across daylight saving). null for a one-off. */
export function nextAfter(kind: ScheduleKind, at: Date, now = new Date()): Date | null {
  if (kind === 'once') return null;
  const step = kind === 'weekly' ? 7 : 14;
  const hm = ctHm(at);
  let day = ctDay(at);
  let t = at;
  do { day = addDays(day, step); t = slotAt(day, hm); } while (t <= now);
  return t;
}

export type RunResult = { id: string; importId?: string; sent?: number; error?: string };

export async function runDueSchedules(supabase: Supa, opts: { apiKey: string | undefined; budget: number | null; now?: Date }): Promise<RunResult[]> {
  const now = opts.now ?? new Date();
  const { data: due, error } = await supabase.from('newsletter_schedules')
    .select('id, newsletter_key, audience, kind, next_at, created_by_name')
    .eq('paused', false).not('next_at', 'is', null).lte('next_at', now.toISOString()).order('next_at');
  if (error) throw new Error(error.message);
  const out: RunResult[] = [];
  let budget = opts.budget;
  for (const s of due || []) {
    const at = new Date(s.next_at as string);
    const next = nextAfter(s.kind as ScheduleKind, at, now);
    // Claim this run: only the ping that moves next_at on gets to send it.
    const { data: claimed } = await supabase.from('newsletter_schedules')
      .update({ next_at: next?.toISOString() ?? null, last_sent_at: now.toISOString() })
      .eq('id', s.id).eq('next_at', s.next_at as string).select('id');
    if (!claimed?.length) continue;
    try {
      const emails = await resolveAudience(supabase, cleanAudience(s.audience));
      if (!emails.length) throw new Error('Nobody on the list to send to');
      const imp = await createImport(supabase, {
        emails, createdBy: null,
        createdByName: `${s.created_by_name || 'Schedule'} (scheduled)`,
        newsletterKey: s.newsletter_key as string,
      });
      await supabase.from('newsletter_schedules').update({ last_import_id: imp.id, last_error: null }).eq('id', s.id);
      let sent = 0;
      if (opts.apiKey && imp.pending && (budget == null || budget > 0)) {
        const r = await sendFromImports(supabase, { apiKey: opts.apiKey, importIds: [imp.id], budget });
        sent = r.sent;
        if (budget != null) budget -= r.cost;
      }
      out.push({ id: s.id, importId: imp.id, sent });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not send';
      await supabase.from('newsletter_schedules').update({ last_error: msg }).eq('id', s.id);
      out.push({ id: s.id, error: msg });
    }
  }
  return out;
}
