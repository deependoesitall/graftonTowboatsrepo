// src/app/api/site-contact/route.ts
//
// The website contact form. Public — anyone can POST to it, which is the whole
// point and also why it validates carefully.
//
// ORDER OF OPERATIONS IS DELIBERATE: store first, then email.
// If the email fails, the enquiry is already saved and the customer still gets
// a success message — because from their side the message DID arrive. The
// failure is recorded on the row so it can be spotted, rather than vanishing.
// Doing it the other way round means a Resend outage turns into "we never heard
// from you", which is how you lose a barge line.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

const MIN_FILL_MS = 4000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 5;

const Body = z.object({
  name: z.string().trim().min(1, 'Please add your name.').max(120),
  email: z.string().trim().email('That email address doesn\'t look right.').max(200).or(z.literal('')),
  phone: z.string().trim().max(40),
  vessel: z.string().trim().max(160),
  // Long enough for a real enquiry, short enough that nobody pastes a novel.
  message: z.string().trim().min(1, 'Please add a message.').max(4000),
  // Honeypot. Real browsers never fill it because it isn't visible.
  website: z.string().max(200).optional().default(''),
  // Client clock when the form mounted. Used for min-fill-time (bots POST instantly).
  form_started_ms: z.number().int().positive().optional(),
});

function clientIp(h: Headers): string {
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || '';
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Soft-gate cold SEO / sales-pitch templates. Real barge enquiries never sound like this. */
function isSalesPitchTemplate(message: string, name: string, email: string): boolean {
  const blob = `${name}\n${email}\n${message}`.toLowerCase();
  const needles = [
    'spotted a few things',
    'practical suggestions',
    'send them over',
    'noticed a few things',
    'quick wins for your',
    'improve your google',
    'improve your search',
    'boost your ranking',
    'seo audit',
    'website audit',
    'i can help you get more leads',
    'grow your online presence',
    'digital marketing agency',
    'we help businesses like yours',
    'free website review',
    'noticed your website',
    'came across your site',
    'came across your website',
    'came across your web site',
    'i came across your',
    'worth looking into',
    'could be worth looking',
    'few quick notes',
    'put together a few',
    'would you like me to send',
    'quick notes with some',
    'some practical suggestions',
    'partnership opportunity',
    'guest post',
    'link building',
    'improve your website',
    'audit of your site',
    'found a few issues on your',
  ];
  if (needles.some(n => blob.includes(n))) return true;

  const marine = /\b(grocery|groceries|vessel|towboat|tow boat|barge|crew change|mile marker|grafton|sinclair|supplies|captain|cook|dock|eta|tow)\b/i.test(message);
  if (marine) return false;

  if (/digital@|\.digital@|seo@|marketing@|leads@/i.test(email)) return true;

  const weak = [
    'came across',
    'worth looking',
    'quick notes',
    'send them over',
    'practical suggestion',
    'spotted a few',
    'noticed a few',
  ].filter(w => blob.includes(w));
  return weak.length >= 2;
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Please check the form and try again.' },
      { status: 400 },
    );
  }
  const { name, email, phone, vessel, message, website, form_started_ms } = parsed.data;
  const ip = clientIp(req.headers);

  // Bot caught. Return 200 rather than an error: telling a bot it failed just
  // teaches whoever wrote it to fix the bot.
  if (website.trim()) {
    console.warn('[site-contact] honeypot trip', { ip });
    return NextResponse.json({ ok: true });
  }

  // Instant posts (no form_started_ms, or filled too fast) — same silent 200.
  if (
    typeof form_started_ms !== 'number'
    || !Number.isFinite(form_started_ms)
    || Date.now() - form_started_ms < MIN_FILL_MS
  ) {
    console.warn('[site-contact] min-fill-time trip', { ip, form_started_ms });
    return NextResponse.json({ ok: true });
  }

  // We need SOME way to reply. The form checks this too; the server does not
  // trust the form.
  if (!email && !phone) {
    return NextResponse.json(
      { error: 'Please add an email address or a phone number so we can reply.' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // IP rate limit — refuse quietly after the cap.
  if (ip) {
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count } = await supabase
      .from('contact_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since);
    if ((count || 0) >= RATE_MAX) {
      console.warn('[site-contact] rate-limit trip', { ip, count });
      return NextResponse.json({ ok: true });
    }
  }

  const parkedPitch = isSalesPitchTemplate(message, name, email);

  // ── 1. Store. This is the part that must not fail silently. ──────────────
  const { data: row, error: insErr } = await supabase
    .from('contact_submissions')
    .insert({
      name,
      email: email || null,
      phone: phone || null,
      vessel: vessel || null,
      message,
      ip: ip || null,
      user_agent: (req.headers.get('user-agent') || '').slice(0, 400),
      ...(parkedPitch
        ? { email_error: 'parked: sales-pitch template (not emailed to staff)' }
        : {}),
    })
    .select('id')
    .single();

  if (insErr) {
    console.error('Contact form insert failed:', insErr);
    return NextResponse.json(
      { error: 'We couldn\'t save that. Please call us on (618) 556-0290.' },
      { status: 500 },
    );
  }

  // Soft-gate: success UI for the sender; staff are not emailed the pitch.
  if (parkedPitch) {
    console.warn('[site-contact] parked sales-pitch', { id: row.id, ip, name });
    return NextResponse.json({ ok: true });
  }

  // ── 2. Notify. Best-effort — a failure here does NOT fail the request. ──
  // BUSINESS_EMAIL is the live To (currently deepenptech@gmail.com). Do not
  // redirect this to graftontowboatservices@gmail.com.
  const to = process.env.BUSINESS_EMAIL;
  const from = process.env.EMAIL_FROM;
  let emailError: string | null = null;

  if (!to || !from || !process.env.RESEND_API_KEY) {
    emailError = 'Email not configured (BUSINESS_EMAIL / EMAIL_FROM / RESEND_API_KEY)';
  } else {
    try {
      const replyTo = email || undefined;
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from,
        to,
        subject: `Website enquiry — ${name}${vessel ? ` (${vessel})` : ''}`,
        ...(replyTo ? { replyTo } : {}),
        html: `
          <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:600px">
            <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7480;margin:0 0 6px">
              Grafton Towboat Services · website contact form
            </p>
            <h2 style="margin:0 0 18px;color:#1E3D1E">${esc(name)}</h2>
            <table style="border-collapse:collapse;font-size:14px;margin-bottom:18px">
              ${vessel ? `<tr><td style="padding:4px 14px 4px 0;color:#6b7480">Vessel / company</td><td><strong>${esc(vessel)}</strong></td></tr>` : ''}
              ${email ? `<tr><td style="padding:4px 14px 4px 0;color:#6b7480">Email</td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>` : ''}
              ${phone ? `<tr><td style="padding:4px 14px 4px 0;color:#6b7480">Phone</td><td><a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a></td></tr>` : ''}
            </table>
            <div style="background:#f6f7f9;border-left:3px solid #D9E84A;padding:14px 18px;white-space:pre-wrap;font-size:15px;line-height:1.6;color:#1f2733">${esc(message)}</div>
            <p style="font-size:11px;color:#9aa0a8;margin-top:22px">
              Saved as submission ${row.id}. Reply to this email to answer${email ? ' them' : ' — note they left a phone number, not an email'}.
            </p>
          </div>`,
      });
    } catch (e) {
      emailError = e instanceof Error ? e.message : 'Unknown send failure';
      console.error('Contact form email failed:', e);
    }
  }

  await supabase
    .from('contact_submissions')
    .update(
      emailError
        ? { email_error: emailError.slice(0, 500) }
        : { emailed_at: new Date().toISOString() },
    )
    .eq('id', row.id);

  return NextResponse.json({ ok: true });
}
