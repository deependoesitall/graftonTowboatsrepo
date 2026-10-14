// src/app/api/admin/contacts/route.ts
//
// The email list. GTS only.
//
// GET                         → { contacts, companies }
// GET ?accounts=1             → { accounts }: every customer login, on the list or not
// POST { rows: [{ email, name?, company?, vessel? }] } → add (dedupe, validate)
// PATCH { email, name?, company?, vessel?, status? }  → edit one contact
// GET ?problems=1             → { problems }: bounced/blocked addresses
// PATCH { email, fix, login }  → replace a bad address (and the login/crew using it)
// PATCH { email, clear: true } → clear a bounce/block (Resend too); never an unsubscribe
// DELETE ?email=              → remove one contact
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { createServiceClient } from '@/lib/supabase/server';
import { accountHolders, addContacts, allContacts } from '@/lib/contacts';
import { normalizeEmail } from '@/lib/email-address';
import { clearBounce, fixEmail, problemAddresses } from '@/lib/bounces';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STATUSES = ['subscribed', 'unsubscribed', 'bounced', 'suppressed'];

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;
  try {
    if (new URL(req.url).searchParams.get('problems')) return NextResponse.json({ problems: await problemAddresses(createServiceClient()) });
    if (new URL(req.url).searchParams.get('accounts')) return NextResponse.json({ accounts: await accountHolders(createServiceClient()) });
    const contacts = await allContacts(createServiceClient());
    const companies = [...new Set(contacts.map((c) => c.company).filter(Boolean) as string[])].sort();
    return NextResponse.json({ contacts, companies });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 20000) : [];
  if (!rows.length) return NextResponse.json({ error: 'No addresses.' }, { status: 400 });
  try {
    const r = await addContacts(createServiceClient(), rows, rows.length > 1 ? 'imported' : 'manual');
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not add' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(String(body.email || ''));
  if (!email) return NextResponse.json({ error: 'No address.' }, { status: 400 });
  const by = session.display_name || session.username;
  if (body.clear === true || typeof body.fix === 'string') {
    try {
      if (body.clear === true) { await clearBounce(createServiceClient(), email, by); return NextResponse.json({ ok: true }); }
      return NextResponse.json({ ok: true, ...(await fixEmail(createServiceClient(), email, body.fix, body.login === true, by)) });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not save' }, { status: 400 });
    }
  }
  const patch: Record<string, unknown> = {};
  for (const k of ['name', 'company', 'vessel'] as const) {
    if (k in body) patch[k] = String(body[k] ?? '').trim().slice(0, 120) || null;
  }
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
    // Back to subscribed only through Clear bounce (which also clears Resend);
    // an unsubscribe is the person's choice and stays.
    if (body.status === 'subscribed') {
      const { data: cur } = await createServiceClient().from('email_contacts').select('status').eq('email', email).maybeSingle();
      if (cur && cur.status !== 'subscribed') {
        return NextResponse.json({ error: cur.status === 'unsubscribed' ? 'They unsubscribed. Only they can sign back up.' : 'Use Clear bounce for this one.' }, { status: 400 });
      }
    }
    patch.status = body.status;
    patch.status_reason = `Set by ${session.display_name || session.username}`;
    patch.status_at = new Date().toISOString();
  }
  const { error } = await createServiceClient().from('email_contacts').update(patch).eq('email', email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;
  const email = normalizeEmail(new URL(req.url).searchParams.get('email') || '');
  if (!email) return NextResponse.json({ error: 'No address.' }, { status: 400 });
  const { error } = await createServiceClient().from('email_contacts').delete().eq('email', email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
