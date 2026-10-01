// src/app/api/admin/customer-email/route.ts
//
// Sends the two hand-fired customer emails. GTS only — Sinclair's staff have
// no business mailing GTS's customers in GTS's name.
//
// GET  ?template=welcome|announcement|signin  → { subject, html } for the preview.
// POST { template, to[], vars?, bcc? } → sends it.
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdmin } from '@/lib/admin-auth-server';
import { createServiceClient } from '@/lib/supabase/server';
import { buildWelcomeEmail, buildAnnouncementEmail, buildSignInEmail, CustomerEmailKey } from '@/lib/customer-emails';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One place that decides what a template looks like, so the preview the
 *  sender approved is byte-for-byte what the customer receives. */
function render(template: CustomerEmailKey, vars: Record<string, string>) {
  const creds = {
    firstName:  vars.firstName  || '',
    vesselName: vars.vesselName || '',
    loginEmail: vars.loginEmail || '',
    password:   vars.password   || '',
  };
  if (template === 'welcome') return buildWelcomeEmail(creds);
  if (template === 'signin') return buildSignInEmail(creds);
  return buildAnnouncementEmail();
}

function parseTemplate(raw: string | null): CustomerEmailKey | null {
  return raw === 'welcome' || raw === 'announcement' || raw === 'signin' ? raw : null;
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const url = new URL(req.url);
  const template = parseTemplate(url.searchParams.get('template'));
  if (!template) return NextResponse.json({ error: 'Unknown template' }, { status: 400 });

  const vars: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { if (k !== 'template') vars[k] = v; });
  return NextResponse.json(render(template, vars));
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'RESEND_API_KEY is not set. Add it in Vercel and redeploy.' },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const template = parseTemplate(body.template);
  if (!template) return NextResponse.json({ error: 'Unknown template' }, { status: 400 });

  const supabaseEarly = createServiceClient();
  const { data: settingsEarly } = await supabaseEarly
    .from('admin_settings').select('business_email').single();
  const gtsInbox = settingsEarly?.business_email
    || process.env.BUSINESS_EMAIL
    || 'GraftonTowboatServices@gmail.com';

  // "Send me one first" — the same message, to the GTS inbox, so whoever is
  // about to mail a hundred barge lines can see it land in a real client
  // before anyone else does.
  const recipients: string[] = body.test === true
    ? [gtsInbox]
    : (Array.isArray(body.to) ? body.to : []);
  const clean = Array.from(new Set(
    recipients.map((e) => String(e).trim()).filter((e) => EMAIL_RE.test(e)),
  ));
  if (!clean.length) {
    return NextResponse.json({ error: 'No valid email addresses.' }, { status: 400 });
  }

  // The welcome email is addressed to one person and carries their password.
  // Sending it to a list would hand everyone on it the same login.
  if ((template === 'welcome' || template === 'signin') && clean.length > 1 && body.test !== true) {
    return NextResponse.json(
      { error: 'This email carries one person’s password. Send it to one address at a time.' },
      { status: 400 },
    );
  }

  const { subject, html } = render(template, body.vars || {});

  const replyTo  = gtsInbox;
  const fromName = 'Grafton Towboat Services';
  const fromAddr = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const from     = fromAddr.includes('<') ? fromAddr : `${fromName} <${fromAddr}>`;

  const resend = new Resend(apiKey);

  /**
   * ANNOUNCEMENTS GO OUT BCC, ONE MESSAGE PER SEND.
   *
   * Jen asked for "BCC and then, or even individually". Putting a hundred
   * barge-line contacts in `to` would show every competitor who else GTS
   * mails. Addressing it to the GTS inbox and BCC'ing the list keeps the
   * recipient list private and still reads as a normal email.
   */
  const bulk = template === 'announcement' && (clean.length > 1 || body.bcc);

  try {
    const result = bulk
      ? await resend.emails.send({ from, to: [replyTo], bcc: clean, replyTo, subject, html })
      : await resend.emails.send({ from, to: clean, replyTo, subject, html });

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message || JSON.stringify(result.error) },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, sent: clean.length, bcc: bulk, subject, test: body.test === true, to: clean[0] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Send failed' },
      { status: 502 },
    );
  }
}
