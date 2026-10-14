// Bounced and blocked addresses, managed from the Email list: fix a typo
// (the contact, and the login/boat using it), or clear the block so the
// address can be tried again. Opt-outs (unsubscribed) are never cleared.
import { createServiceClient } from '@/lib/supabase/server';
import { listAuthUsers } from '@/lib/auth-user-dates';
import { isValidEmail, normalizeEmail } from '@/lib/email-address';

type Supa = ReturnType<typeof createServiceClient>;
const PROBLEM = ['bounced', 'suppressed'];

/** Take an address off Resend's suppression list. Not on it is fine. */
async function removeResendSuppression(email: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch(`https://api.resend.com/suppressions/${encodeURIComponent(email)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok && res.status !== 404) {
    const j = await res.json().catch(() => ({}));
    throw new Error(`Resend: ${(j as { message?: string }).message || res.status}`);
  }
}

export async function clearBounce(supabase: Supa, rawEmail: string, by: string) {
  const email = normalizeEmail(rawEmail);
  const { data: c } = await supabase.from('email_contacts').select('status').eq('email', email).maybeSingle();
  if (!c) throw new Error('Not on the list');
  if (!PROBLEM.includes(c.status)) {
    throw new Error(c.status === 'unsubscribed' ? 'They unsubscribed. Only they can sign back up.' : 'This address is not bounced or blocked.');
  }
  await removeResendSuppression(email);
  await supabase.from('email_suppressions').delete().eq('email', email);
  const { error } = await supabase.from('email_contacts')
    .update({ status: 'subscribed', status_reason: `Cleared by ${by}; may bounce again`, status_at: new Date().toISOString() })
    .eq('email', email).in('status', PROBLEM);
  if (error) throw new Error(error.message);
}

/** Replace a bad address. The old one stays marked; the new one is
 *  subscribed. With `login`, a customer login and boat crew rows using the
 *  old address move to the new one too. */
export async function fixEmail(supabase: Supa, rawOld: string, rawNew: string, login: boolean, by: string) {
  const old = normalizeEmail(rawOld);
  const next = normalizeEmail(rawNew);
  if (!isValidEmail(next)) throw new Error('That new address doesn\'t look right.');
  if (next === old) throw new Error('That\'s the same address.');
  const { data: c } = await supabase.from('email_contacts').select('*').eq('email', old).maybeSingle();
  if (!c) throw new Error('Not on the list');
  const { data: existing } = await supabase.from('email_contacts').select('status').eq('email', next).maybeSingle();
  if (existing && existing.status !== 'subscribed') {
    throw new Error(`${next} is already on the list as ${existing.status === 'suppressed' ? 'blocked' : existing.status}.`);
  }

  const updated = { contact: true, login: false, crew: 0 };
  if (login) {
    const users = await listAuthUsers(supabase);
    if (users.some((u) => (u.email || '').toLowerCase() === next)) throw new Error(`${next} already has its own login.`);
    const u = users.find((x) => (x.email || '').toLowerCase() === old);
    if (u) {
      const { error } = await supabase.auth.admin.updateUserById(u.id, { email: next, email_confirm: true });
      if (error) throw new Error(`Login: ${error.message}`);
      updated.login = true;
    }
    const { data: crew, error } = await supabase.from('vessel_members').update({ email: next }).ilike('email', old).select('id');
    if (error) throw new Error(error.message);
    updated.crew = crew?.length || 0;
  }

  if (!existing) {
    const { error } = await supabase.from('email_contacts').insert({
      email: next, name: c.name, company: c.company, vessel: c.vessel,
      user_id: updated.login ? c.user_id : null, source: 'manual', status: 'subscribed',
      status_reason: `Fixed from ${old} by ${by}`, status_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }
  await supabase.from('email_contacts').update({ status_reason: `${c.status_reason || ''} · replaced by ${next}`.replace(/^ · /, '') }).eq('email', old);
  return updated;
}

/** Bounced/blocked addresses with reason and date (for badges elsewhere). */
export async function problemAddresses(supabase: Supa) {
  const { data, error } = await supabase.from('email_contacts')
    .select('email, status, status_reason, status_at').in('status', PROBLEM);
  if (error) throw new Error(error.message);
  return data || [];
}
