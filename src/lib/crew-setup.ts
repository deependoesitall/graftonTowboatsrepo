// src/lib/crew-setup.ts
//
// The steps every "add a customer" form in the admin takes, in one place:
// add a company, add a boat, put a login on a boat, send the welcome email.
// Customers → Logins, its New sign-ups list and Emails → New customer all use
// these, and each one calls the same admin APIs it always did.
//
// Client side (uses the admin session through adminFetch).
import { adminFetch } from '@/lib/admin-auth';

type Named = { id: string; name: string };

async function post(url: string, body: unknown): Promise<{ ok: boolean; j: Record<string, unknown> & { error?: string } }> {
  const res = await adminFetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { ok: res.ok, j: await res.json().catch(() => ({})) };
}

export async function addCompany(name: string): Promise<Named> {
  const { ok, j } = await post('/api/admin/companies', { name: name.trim() });
  const c = j.company as Named | undefined;
  if (!ok || !c?.id) throw new Error(j.error || 'Could not add the company.');
  return { id: c.id, name: c.name };
}

/** Reuses a boat of the same name under that company rather than making a second. */
export async function addBoat(companyId: string, name: string): Promise<Named> {
  const { ok, j } = await post('/api/admin/vessels', { company_id: companyId, name: name.trim(), backfill_orders: true });
  const v = j.vessel as Named | undefined;
  if (!ok || !v?.id) throw new Error(j.error || 'Could not add the boat.');
  return { id: v.id, name: v.name };
}

/** Put an account that already exists on a boat. Its password is not touched. */
export async function linkAccountToBoat(account: { user_id?: string; email?: string }, vesselId: string, role: string): Promise<void> {
  const { ok, j } = await post('/api/admin/signups', { ...account, vessel_id: vesselId, role });
  if (!ok) throw new Error(j.error || 'Could not link the account.');
}

export async function accountExists(email: string): Promise<boolean> {
  const res = await fetch('/api/auth/check-email', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const j = await res.json().catch(() => ({}));
  return j.exists === true;
}

export type WelcomeVars = { firstName: string; vesselName: string; loginEmail: string; password: string };

export async function sendWelcomeEmail(to: string, vars: WelcomeVars, test = false): Promise<{ to?: string }> {
  const { ok, j } = await post('/api/admin/customer-email', { template: 'welcome', to: [to.trim()], vars, ...(test ? { test: true } : {}) });
  if (!ok) throw new Error(j.error || 'The email did not send.');
  return { to: j.to as string | undefined };
}

export type NewLogin = {
  first: string; last: string; email: string; password: string; role: string; sendWelcome: boolean;
};
export type LoginResult = { linkedExisting: boolean; emailed: boolean; emailError?: string };

/**
 * Put a login on a boat. If the email already has an account, that account
 * is linked to the boat as it is (no new password, no welcome email, since
 * there is no password to put in it). Otherwise the login is created and,
 * when asked, the welcome email goes out with the password just set.
 */
export async function addLoginToBoat(boat: Named, login: NewLogin): Promise<LoginResult> {
  const email = login.email.trim().toLowerCase();
  if (await accountExists(email)) {
    await linkAccountToBoat({ email }, boat.id, login.role);
    return { linkedExisting: true, emailed: false };
  }
  const { ok, j } = await post(`/api/admin/vessels/${boat.id}/members`, {
    // The login needs a first name; with none typed it is filed as "<boat> crew".
    first_name: login.first.trim() || `${boat.name} crew`,
    last_name: login.last.trim(),
    email,
    password: login.password.trim(),
    role: login.role,
  });
  if (!ok) throw new Error(j.error || 'Could not create the login.');
  if (!login.sendWelcome) return { linkedExisting: false, emailed: false };
  try {
    await sendWelcomeEmail(email, {
      firstName: login.first.trim(), vesselName: boat.name, loginEmail: email, password: login.password.trim(),
    });
    return { linkedExisting: false, emailed: true };
  } catch (e) {
    return { linkedExisting: false, emailed: false, emailError: e instanceof Error ? e.message : 'The email did not send.' };
  }
}
