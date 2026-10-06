// src/app/api/admin/staff-invite/route.ts
// Plain-text staff login email. The Oct 5 onboarding send to Mary Karen /
// Laura never left the box because admin-user create had no send path —
// only a copy of the password on screen. This is that send path.
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdmin, canManageAdminUsers } from '@/lib/admin-auth-server';
import { createServiceClient } from '@/lib/supabase/server';
import { onboardBody, onboardSubject, type OnboardKind } from '@/lib/onboard-links';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;
  if (!canManageAdminUsers(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'RESEND_API_KEY is not set. Add it in Vercel and redeploy.' },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const to = String(body.to || '').trim();
  const username = String(body.username || '').trim();
  const password = String(body.password || '').trim();
  const displayName = String(body.display_name || '').trim();
  let kind: OnboardKind = body.kind === 'sinclair' ? 'sinclair' : 'gts';
  // Sinclair's manager may only send Sinclair's install copy.
  if (session.role === 'manager') kind = 'sinclair';
  if (!EMAIL_RE.test(to)) {
    return NextResponse.json({ error: 'Need a valid email address.' }, { status: 400 });
  }
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: settings } = await supabase.from('admin_settings').select('business_email').single();
  const replyTo = settings?.business_email
    || process.env.BUSINESS_EMAIL
    || 'GraftonTowboatServices@gmail.com';

  const bodyText = onboardBody({ kind, name: displayName, username, password });
  const subject = onboardSubject(kind);
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f5f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;">
  <div style="background:#1E3D1E;padding:18px 26px;">
    <div style="color:#D9E84A;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.6px;">Grafton Towboat Services</div>
  </div>
  <div style="padding:26px;">
    <h1 style="margin:0 0 12px;font-size:22px;color:#15181C;">${subject.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#15181C;">
      Open the app, sign in, and add it to your home screen. Turn on notifications when it asks.
    </p>
    <pre style="margin:0 0 18px;padding:16px 18px;background:#F6F8F4;border:1px solid #D7DCD4;border-radius:5px;font-size:14px;line-height:1.7;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${
      bodyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }</pre>
  </div>
</div>
</body></html>`;

  const fromAddr = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const from = fromAddr.includes('<') ? fromAddr : `Grafton Towboat Services <${fromAddr}>`;
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: [to],
    replyTo,
    subject,
    html,
    text: bodyText,
  });
  if (result.error) {
    return NextResponse.json(
      { error: result.error.message || JSON.stringify(result.error) },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, to });
}
