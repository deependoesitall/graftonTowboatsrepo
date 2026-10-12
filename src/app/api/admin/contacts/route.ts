// src/app/api/admin/contacts/route.ts
//
// The email list. GTS only.
//
// GET                         → { contacts, companies }
// POST { rows: [{ email, name?, company?, vessel? }] } → add (dedupe, validate)
// PATCH { email, name?, company?, vessel?, status? }  → edit one contact
// DELETE ?email=              → remove one contact
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { createServiceClient } from '@/lib/supabase/server';
import { addContacts, allContacts } from '@/lib/contacts';
import { normalizeEmail } from '@/lib/email-address';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STATUSES = ['subscribed', 'unsubscribed', 'bounced', 'suppressed'];

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;
  try {
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
  const patch: Record<string, unknown> = {};
  for (const k of ['name', 'company', 'vessel'] as const) {
    if (k in body) patch[k] = String(body[k] ?? '').trim().slice(0, 120) || null;
  }
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
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
