// The email contact list (table email_contacts). Server only.
import { createServiceClient } from '@/lib/supabase/server';
import { listAuthUsers } from '@/lib/auth-user-dates';
import { isValidEmail, normalizeEmail, type ContactRow } from '@/lib/email-address';

type Supa = ReturnType<typeof createServiceClient>;

export type Contact = {
  email: string; name: string | null; company: string | null; vessel: string | null;
  user_id: string | null; source: 'imported' | 'sign-up' | 'manual';
  status: 'subscribed' | 'unsubscribed' | 'bounced' | 'suppressed';
  status_reason: string | null; status_at: string | null; added_at: string;
  /** Live: a customer login uses this address (any case). */
  has_account?: boolean;
};

export type Audience = { company?: string; source?: string; q?: string; account?: 'yes' | 'no' };

export async function allContacts(supabase: Supa): Promise<Contact[]> {
  const out: Contact[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supabase.from('email_contacts').select('*').order('added_at', { ascending: false }).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as Contact[]));
    if (!data || data.length < 1000) break;
  }
  // Checked against logins on every read, so it is never stale.
  const logins = new Set((await listAuthUsers(supabase)).map((u) => (u.email || '').toLowerCase()).filter(Boolean));
  for (const c of out) c.has_account = logins.has(c.email.toLowerCase());
  return out;
}

export function matches(c: Contact, a: Audience): boolean {
  if (a.company && (c.company || '').toLowerCase() !== a.company.toLowerCase()) return false;
  if (a.source && c.source !== a.source) return false;
  if (a.account && !!c.has_account !== (a.account === 'yes')) return false;
  if (a.q) {
    const q = a.q.toLowerCase();
    if (![c.email, c.name, c.company, c.vessel].some((v) => (v || '').toLowerCase().includes(q))) return false;
  }
  return true;
}

/** Subscribed addresses in `a`. Everyone else is never sent to. */
export async function audienceEmails(supabase: Supa, a: Audience): Promise<string[]> {
  return (await allContacts(supabase)).filter((c) => c.status === 'subscribed' && matches(c, a)).map((c) => c.email);
}

/** Who a send goes to: everyone subscribed (optionally filtered), the people
 *  on an earlier send, or a pasted list. Unsubscribed and bounced addresses
 *  are dropped later, when the send is made. */
export type SendAudience = Audience & { fromImport?: string; emails?: string };

export function cleanAudience(x: unknown): SendAudience {
  const a = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const fromImport = str(a.fromImport);
  return {
    company: str(a.company), source: str(a.source), q: str(a.q),
    account: a.account === 'yes' || a.account === 'no' ? a.account : undefined,
    fromImport: fromImport && /^[0-9a-f-]{36}$/i.test(fromImport) ? fromImport : undefined,
    emails: str(a.emails)?.slice(0, 200_000),
  };
}

export async function resolveAudience(supabase: Supa, a: SendAudience): Promise<string[]> {
  if (a.emails) return a.emails.split(/[\s,;]+/).filter(Boolean);
  if (a.fromImport) {
    const out: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('email_import_recipients').select('email')
        .eq('import_id', a.fromImport).neq('status', 'invalid').order('id').range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...(data || []).map((r) => String(r.email).toLowerCase()));
      if (!data || data.length < 1000) break;
    }
    return [...new Set(out)];
  }
  return audienceEmails(supabase, a);
}

/** Customer logins by address, with the boat and company they're on. */
async function customersByEmail(supabase: Supa, emails: string[]) {
  const want = new Set(emails);
  const users = (await listAuthUsers(supabase)).filter((u) => u.email && want.has(u.email.toLowerCase()));
  const out = new Map<string, { user_id: string; name: string | null; company: string | null; vessel: string | null }>();
  if (!users.length) return out;
  const ids = users.map((u) => u.id);
  const [{ data: profiles }, { data: members }] = await Promise.all([
    supabase.from('customer_profiles').select('user_id, first_name, last_name, company_name, vessel_name').in('user_id', ids),
    supabase.from('vessel_members').select('user_id, vessels(name, companies(name))').in('user_id', ids),
  ]);
  for (const u of users) {
    const p = (profiles || []).find((x) => x.user_id === u.id);
    const m = (members || []).find((x) => x.user_id === u.id) as { vessels?: { name?: string; companies?: { name?: string } } } | undefined;
    out.set(u.email!.toLowerCase(), {
      user_id: u.id,
      name: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null,
      company: m?.vessels?.companies?.name || p?.company_name || null,
      vessel: m?.vessels?.name || p?.vessel_name || null,
    });
  }
  return out;
}

/** Add contacts. Existing addresses are left as they are; new ones are linked
 *  to a customer login with the same address and fill name/boat from it. */
export async function addContacts(supabase: Supa, rows: ContactRow[], source: Contact['source']) {
  const clean = new Map<string, ContactRow>();
  const invalid: string[] = [];
  for (const r of rows) {
    const email = normalizeEmail(r.email || '');
    if (!isValidEmail(email)) { invalid.push(r.email); continue; }
    if (!clean.has(email)) clean.set(email, { ...r, email });
  }
  const emails = [...clean.keys()];
  const existing = new Set<string>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await supabase.from('email_contacts').select('email').in('email', emails.slice(i, i + 200));
    for (const d of data || []) existing.add(d.email);
  }
  const fresh = emails.filter((e) => !existing.has(e));
  const cust = await customersByEmail(supabase, fresh);
  const insert = fresh.map((e) => {
    const r = clean.get(e)!;
    const c = cust.get(e);
    return {
      email: e,
      name: r.name?.trim() || c?.name || null,
      company: r.company?.trim() || c?.company || null,
      vessel: r.vessel?.trim() || c?.vessel || null,
      user_id: c?.user_id || null,
      source,
    };
  });
  for (let i = 0; i < insert.length; i += 500) {
    const { error } = await supabase.from('email_contacts').upsert(insert.slice(i, i + 500), { onConflict: 'email', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return { added: insert.length, existing: emails.length - insert.length, invalid };
}
