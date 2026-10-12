// Unsubscribe from GTS list emails. GET shows a one-button page (so link
// scanners that open URLs don't unsubscribe anyone); POST does it, which is
// also what Gmail's one-click List-Unsubscribe sends.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyUnsubscribe } from '@/lib/unsubscribe';

export const dynamic = 'force-dynamic';

function page(title: string, body: string, status = 200) {
  return new NextResponse(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;max-width:480px;margin:48px auto;padding:0 20px;color:#222;line-height:1.5;">
<h1 style="font-size:20px;">${title}</h1>${body}
<p style="color:#777;font-size:13px;margin-top:32px;">Grafton Towboat Services &middot; (618) 556-0290</p></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function args(req: NextRequest) {
  const u = new URL(req.url);
  const email = (u.searchParams.get('e') || '').trim().toLowerCase();
  const token = u.searchParams.get('t') || '';
  return { email, token, ok: !!email && (() => { try { return verifyUnsubscribe(email, token); } catch { return false; } })() };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export async function GET(req: NextRequest) {
  const { email, token, ok } = args(req);
  if (!ok) return page('Link not recognized', '<p>This unsubscribe link is incomplete. Reply to any of our emails and we will take you off the list.</p>', 400);
  return page('Unsubscribe', `<p>Stop list emails from Grafton Towboat Services to <b>${esc(email)}</b>?</p>
<form method="post" action="?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}">
<button type="submit" style="background:#1E3D1E;color:#fff;border:0;border-radius:6px;padding:12px 22px;font-size:15px;cursor:pointer;">Unsubscribe</button></form>
<p style="font-size:13px;color:#555;">Order emails for your boat still come through.</p>`);
}

export async function POST(req: NextRequest) {
  const { email, ok } = args(req);
  if (!ok) return page('Link not recognized', '<p>This unsubscribe link is incomplete.</p>', 400);
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const status = { status: 'unsubscribed', status_reason: 'Unsubscribed by link', status_at: now };
  const { data, error: uErr } = await supabase.from('email_contacts').update(status).eq('email', email).select('email');
  let error = uErr;
  if (!uErr && !data?.length) {
    ({ error } = await supabase.from('email_contacts').insert({ email, source: 'manual', ...status }));
  }
  // Waiting sends to this address stop now.
  await supabase.from('email_import_recipients').update({ status: 'skipped', error: 'Unsubscribed' })
    .eq('email', email).eq('status', 'pending');
  if (error) return page('Something went wrong', '<p>Please try again, or reply to any of our emails.</p>', 500);
  return page('You are unsubscribed', `<p><b>${esc(email)}</b> won't get list emails from us anymore.</p>`);
}
