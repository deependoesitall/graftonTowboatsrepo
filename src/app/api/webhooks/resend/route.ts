// src/app/api/webhooks/resend/route.ts
//
// Resend tells us here when an announcement bounces or is marked as spam.
// Signed with Svix: RESEND_WEBHOOK_SECRET (whsec_…) checks svix-id,
// svix-timestamp and svix-signature, and anything unsigned, stale or forged
// gets a 401.
//
// The announcement goes out as one email with up to 49 addresses in BCC, so
// Resend's email id names the whole group, not a person. The address is the
// key: email.bounced lists the bounced addresses in data.to, and
// suppression.added carries the one address Resend will no longer send to.
//   email.bounced / email.complained → the sent row turns Failed, with the
//     reason and time; anything still waiting for that address is skipped.
//   suppression.added → remembered, so no later list sends to it.
//   email.delivery_delayed → acknowledged only. Resend keeps retrying; it
//     is not a failure.
import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const TOLERANCE_S = 5 * 60;

function verify(body: string, h: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = h.get('svix-id');
  const ts = h.get('svix-timestamp');
  const sigs = h.get('svix-signature');
  if (!secret || !id || !ts || !sigs) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const want = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest();
  return sigs.split(' ').some((part) => {
    const [ver, b64] = part.split(',');
    if (ver !== 'v1' || !b64) return false;
    const got = Buffer.from(b64, 'base64');
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

type Supa = ReturnType<typeof createServiceClient>;

async function markFailed(supabase: Supa, emails: string[], error: string, at: string, keepReason = false) {
  const touched = new Set<string>();
  for (const email of emails) {
    const { data } = await supabase.from('email_import_recipients')
      .update({ status: 'failed', error, failed_at: at })
      .eq('email', email).in('status', keepReason ? ['sent'] : ['sent', 'failed']).select('import_id');
    for (const r of data || []) touched.add(r.import_id);
    await supabase.from('email_import_recipients')
      .update({ status: 'skipped', error: 'Bounced or marked as spam before' })
      .eq('email', email).eq('status', 'pending');
  }
  // Keep each list's sent count true to what landed.
  for (const id of touched) {
    const { count } = await supabase.from('email_import_recipients')
      .select('id', { count: 'exact', head: true }).eq('import_id', id).eq('status', 'sent');
    await supabase.from('email_imports').update({ sent_count: count || 0 }).eq('id', id);
  }
  return touched.size;
}

const lower = (v: unknown) => String(v || '').trim().toLowerCase();

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!verify(body, req.headers)) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  let evt: { type?: string; created_at?: string; data?: Record<string, unknown> };
  try { evt = JSON.parse(body); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const data = evt.data || {};
  const at = String(evt.created_at || new Date().toISOString());
  if (evt.type === 'email.bounced' || evt.type === 'email.complained') {
    const to = (Array.isArray(data.to) ? data.to : []).map(lower).filter((e) => e.includes('@'));
    const bounce = (data.bounce || {}) as { message?: string; type?: string; subType?: string };
    const error = evt.type === 'email.complained'
      ? 'Marked as spam'
      : `Bounced${bounce.type ? ` (${bounce.type}${bounce.subType ? `, ${bounce.subType}` : ''})` : ''}${bounce.message ? `: ${bounce.message}` : ''}`;
    const supabase = createServiceClient();
    // Per-recipient sends store Resend's email id on the row: match on it
    // first, then on the address for older BCC sends.
    const emailId = typeof data.email_id === 'string' ? data.email_id : '';
    if (emailId) {
      const { data: byId } = await supabase.from('email_import_recipients')
        .select('email').eq('resend_email_id', emailId);
      for (const r of byId || []) if (!to.includes(lower(r.email))) to.push(lower(r.email));
    }
    const lists = await markFailed(supabase, to, error.slice(0, 500), at);
    return NextResponse.json({ ok: true, type: evt.type, addresses: to.length, lists });
  }

  if (evt.type === 'suppression.added') {
    const email = lower(data.email);
    if (email.includes('@')) {
      const supabase = createServiceClient();
      const origin = String(data.origin || 'manual');
      await supabase.from('email_suppressions').upsert(
        { email, origin, reason: `Suppressed in Resend (${origin})`, created_at: String(data.created_at || at) },
        { onConflict: 'email' },
      );
      if (origin !== 'manual') {
        await markFailed(supabase, [email], origin === 'complaint' ? 'Marked as spam' : 'Bounced (hard bounce)', String(data.created_at || at), true);
      }
    }
    return NextResponse.json({ ok: true, type: evt.type });
  }

  // email.delivery_delayed and anything else: acknowledged, nothing to change.
  return NextResponse.json({ ok: true, type: evt.type ?? null, ignored: true });
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
