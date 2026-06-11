// src/app/api/admin/test-email/route.ts
// Diagnostic endpoint — sends a simple test email and returns the exact
// success/error response from Resend so config issues are visible.
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'settings' });
  if (session instanceof NextResponse) return session;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: 'RESEND_API_KEY is not set in Vercel environment variables.',
      hint: 'Go to Vercel → Project → Settings → Environment Variables and add RESEND_API_KEY, then redeploy.',
    }, { status: 200 });
  }

  const supabase = createServiceClient();
  const { data: settings } = await supabase.from('admin_settings').select('business_email').single();
  const toEmail = settings?.business_email || process.env.BUSINESS_EMAIL || 'GraftonTowboatServices@gmail.com';
  const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  const resend = new Resend(apiKey);

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: 'GTS Admin — Test Email',
      html: `<p>This is a test email from the Grafton Towboat Services admin panel.</p>
             <p><b>From:</b> ${fromEmail}<br/><b>To:</b> ${toEmail}</p>
             <p>If you received this, email notifications are working correctly.</p>`,
    });

    if (result.error) {
      return NextResponse.json({
        ok: false,
        error: result.error.message || JSON.stringify(result.error),
        from: fromEmail,
        to: toEmail,
        hint: result.error.message?.includes('domain')
          ? 'The "from" address domain is not verified in Resend. Either verify a domain, or use the default onboarding@resend.dev sender (which can only send to the email address on your Resend account).'
          : undefined,
      }, { status: 200 });
    }

    return NextResponse.json({ ok: true, id: result.data?.id, from: fromEmail, to: toEmail });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err?.message || String(err),
      from: fromEmail,
      to: toEmail,
    }, { status: 200 });
  }
}
