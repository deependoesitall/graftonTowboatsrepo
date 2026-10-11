// src/app/api/cron/email-queue/route.ts
//
// The daily announcement batch. Supabase pg_cron POSTs here every 15 minutes
// with the x-email-queue-secret header (EMAIL_QUEUE_SECRET; the same value is
// in Supabase Vault as email_queue_secret). Most pings do nothing. It sends
// only when all of these hold:
//   • Jen has saved a daily send time (there is no default),
//   • it is past that time today in America/Chicago,
//   • today's batch has not run (admin_settings.email_queue_last_run_on),
//   • some queued import was made before today's send time.
// Then it claims today with one conditional UPDATE, so a second ping that
// lands at the same moment finds the day taken and stops, reads what Resend
// says is left, sends exactly that much (oldest import first), and stops.
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getEmailQuota } from '@/lib/email-quota-server';
import { quotaRoom } from '@/lib/email-quota';
import { ctDay, loadQueueSettings, sendFromImports, slotAt } from '@/lib/email-queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const secret = process.env.EMAIL_QUEUE_SECRET;
  const given = req.headers.get('x-email-queue-secret');
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

const skip = (reason: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: true, ran: false, reason, ...extra });

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const settings = await loadQueueSettings(supabase);
  if (!settings.sendTime) return skip('No daily send time set yet');

  const now = new Date();
  const today = ctDay(now);
  const slot = slotAt(today, settings.sendTime);
  if (now < slot) return skip('Before today\'s send time', { sendAt: slot.toISOString() });
  if (settings.lastRunOn === today) return skip('Already ran today');

  const { data: imports, error } = await supabase.from('email_imports')
    .select('id').in('status', ['queued', 'sending'])
    .lt('created_at', slot.toISOString()).order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!imports?.length) return skip('Nothing queued');

  // Claim today. Only one ping can move the date forward.
  let claim = supabase.from('admin_settings').update({ email_queue_last_run_on: today }).eq('id', settings.id);
  claim = settings.lastRunOn ? claim.eq('email_queue_last_run_on', settings.lastRunOn) : claim.is('email_queue_last_run_on', null);
  const { data: claimed } = await claim.select('id');
  if (!claimed?.length) return skip('Already ran today');

  const release = () => supabase.from('admin_settings')
    .update({ email_queue_last_run_on: settings.lastRunOn }).eq('id', settings.id).eq('email_queue_last_run_on', today);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { await release(); return NextResponse.json({ error: 'RESEND_API_KEY is not set' }, { status: 500 }); }

  let budget: number | null;
  try {
    const room = quotaRoom(await getEmailQuota(apiKey));
    budget = room ? room.left : null;
  } catch (e) {
    // Try again on the next ping rather than lose the day.
    await release();
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read the Resend quota' }, { status: 502 });
  }

  const result = await sendFromImports(supabase, { apiKey, importIds: imports.map((i) => i.id), budget });
  return NextResponse.json({ ok: !result.error, ran: true, day: today, budget, ...result });
}
