'use client';
// src/components/admin/NewCustomerSend.tsx
//
// Emails tab → New customer. Type the company and boat (pick one that exists
// or type a new one), their email and a password, then one button creates
// whatever is missing, makes the login, and sends the welcome email.
// Customers → Logins does the same from its own form; both use the same APIs.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FlaskConical, Loader2, Send } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { CrewRoleField } from '@/components/admin/CrewRoleField';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-rules';
import { addBoat, addCompany } from '@/lib/crew-setup';

export type WelcomeFormVars = { firstName: string; vesselName: string; loginEmail: string; password: string };

type Company = { id: string; name: string };
type Vessel = { id: string; name: string; company_id: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function NewCustomerSend({
  onVars,
  onSent,
  outOfEmails,
  quotaNote,
}: {
  /** Feeds the live preview. */
  onVars: (v: WelcomeFormVars) => void;
  /** Called after any send, so the quota counter refreshes. */
  onSent: () => void;
  /** True when Resend says nothing is left today. */
  outOfEmails: boolean;
  quotaNote: React.ReactNode;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [company, setCompany] = useState('');
  const [boat, setBoat] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('cook');
  const [busy, setBusy] = useState<'' | 'real' | 'test'>('');
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');
  /** A login made by the last press whose email didn't go out: Send again only sends. */
  const [made, setMade] = useState<{ email: string; boat: string; company: string } | null>(null);

  const loadLists = useCallback(async () => {
    const [cRes, vRes] = await Promise.all([adminFetch('/api/admin/companies'), adminFetch('/api/admin/vessels')]);
    const c = await cRes.json().catch(() => ({}));
    const v = await vRes.json().catch(() => ({}));
    if (cRes.ok) setCompanies((c.companies || []).map((x: Company) => ({ id: x.id, name: x.name })));
    if (vRes.ok) setVessels((v.vessels || []).map((x: Vessel) => ({ id: x.id, name: x.name, company_id: x.company_id })));
  }, []);
  useEffect(() => { loadLists(); }, [loadLists]);

  const pickedCompany = useMemo(() => companies.find(c => key(c.name) === key(company)) || null, [companies, company]);
  const companyBoats = useMemo(
    () => (pickedCompany ? vessels.filter(v => v.company_id === pickedCompany.id) : []),
    [vessels, pickedCompany],
  );
  const pickedBoat = useMemo(() => companyBoats.find(v => key(v.name) === key(boat)) || null, [companyBoats, boat]);

  useEffect(() => {
    onVars({ firstName: first.trim(), vesselName: boat.trim(), loginEmail: email.trim(), password });
  }, [first, boat, email, password, onVars]);

  const emailOk = EMAIL_RE.test(email.trim());
  const ready = !!company.trim() && !!boat.trim() && emailOk && password.trim().length >= MIN_PASSWORD_LENGTH;

  function vars(): WelcomeFormVars {
    return { firstName: first.trim(), vesselName: boat.trim(), loginEmail: email.trim(), password: password.trim() };
  }

  async function sendWelcome(test: boolean): Promise<{ ok: boolean; error?: string; to?: string }> {
    const res = await adminFetch('/api/admin/customer-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: 'welcome', to: [email.trim()], vars: vars(), ...(test ? { test: true } : {}) }),
    });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, to: j.to } : { ok: false, error: j.error || 'The email did not send.' };
  }

  async function testSend() {
    setBusy('test'); setOk(''); setError('');
    try {
      const r = await sendWelcome(true);
      if (r.ok) setOk(`Test sent to ${r.to || 'the GTS inbox'}. Nothing was created.`);
      else setError(r.error || 'The test did not send.');
    } finally {
      setBusy('');
      onSent();
    }
  }

  async function createAndSend() {
    setOk(''); setError('');
    if (!ready) {
      setError(`Fill in company, boat, a valid email and a password of ${MIN_PASSWORD_LENGTH}+ characters.`);
      return;
    }
    const addr = email.trim().toLowerCase();
    setBusy('real');
    try {
      let doneBoat = made?.boat || '';
      let doneCompany = made?.company || '';
      if (!(made && made.email === addr)) {
        // One login per email. Check boat logins first, then any site account,
        // since creating would otherwise take over that account's password.
        const mRes = await adminFetch(`/api/admin/vessel-members?q=${encodeURIComponent(addr)}`);
        const mJson = await mRes.json().catch(() => ({}));
        type M = { email: string | null; vessel_name: string | null; company_name: string | null };
        const hit = ((mJson.members || []) as M[]).find(m => (m.email || '').toLowerCase() === addr);
        if (hit) {
          const where = [hit.vessel_name, hit.company_name].filter(Boolean).join(', ');
          setError(`${addr} already has a login${where ? ` (${where})` : ''}. Nothing was created. To resend it, use Customers → Logins → Send onboarding.`);
          return;
        }
        const eRes = await fetch('/api/auth/check-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: addr }),
        });
        const eJson = await eRes.json().catch(() => ({}));
        if (eJson.exists) {
          setError(`${addr} already has an account on the site. Nothing was created. To link it to a boat, use Customers → Logins.`);
          return;
        }

        // Each step adds what it made to the lists, so a retry finds it
        // instead of creating a second company or boat.
        let companyId = pickedCompany?.id || '';
        let companyName = pickedCompany?.name || company.trim();
        if (!companyId) {
          const c = await addCompany(company);
          companyId = c.id;
          companyName = c.name;
          setCompanies(list => [...list, c]);
          setCompany(companyName);
        }

        let vesselId = pickedBoat?.id || '';
        let vesselName = pickedBoat?.name || boat.trim();
        if (!vesselId) {
          const v = await addBoat(companyId, boat);
          vesselId = v.id;
          vesselName = v.name;
          setVessels(list => list.some(x => x.id === vesselId) ? list : [...list, { id: vesselId, name: vesselName, company_id: companyId }]);
          setBoat(vesselName);
        }

        // The login needs a first name; with none typed it is filed as "<boat> crew".
        // The email still opens "Hi there." because the preview only uses a typed name.
        const res = await adminFetch(`/api/admin/vessels/${vesselId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: first.trim() || `${vesselName} crew`,
            last_name: last.trim(),
            email: addr,
            password: password.trim(),
            role,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { setError(j.error || 'Could not create the login.'); return; }
        doneBoat = vesselName;
        doneCompany = companyName;
        setMade({ email: addr, boat: vesselName, company: companyName });
      }

      const sent = await sendWelcome(false);
      if (!sent.ok) {
        setError(`Login created, but the email did not send: ${sent.error} Press Create & send again to send it.`);
        return;
      }
      setOk(`Sent to ${addr}, ${doneBoat}, ${doneCompany}`);
      setMade(null);
      setBoat(''); setEmail(''); setPassword(''); setFirst(''); setLast('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy('');
      onSent();
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label-base" htmlFor="nc-company">Company</label>
          <input id="nc-company" className="input-base" list="nc-companies" value={company} autoComplete="off"
            placeholder="ACBL" onChange={e => { setCompany(e.target.value); setMade(null); setOk(''); }} />
          <datalist id="nc-companies">{companies.map(c => <option key={c.id} value={c.name} />)}</datalist>
          {company.trim() && (
            <p className="text-[11px] text-gray-400 mt-1">{pickedCompany ? 'Existing company' : 'New company'}</p>
          )}
        </div>
        <div>
          <label className="label-base" htmlFor="nc-boat">Boat</label>
          <input id="nc-boat" className="input-base" list="nc-boats" value={boat} autoComplete="off"
            placeholder="Andrew F Koch" onChange={e => { setBoat(e.target.value); setMade(null); setOk(''); }} />
          <datalist id="nc-boats">{companyBoats.map(v => <option key={v.id} value={v.name} />)}</datalist>
          {boat.trim() && (
            <p className="text-[11px] text-gray-400 mt-1">{pickedBoat ? 'Existing boat' : 'New boat'}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label-base" htmlFor="nc-email">Email</label>
          <input id="nc-email" type="email" className="input-base" value={email} autoComplete="off"
            placeholder="cook@…" onChange={e => { setEmail(e.target.value); setOk(''); }} />
        </div>
        <div>
          <label className="label-base" htmlFor="nc-pw">Password</label>
          <input id="nc-pw" type="text" className="input-base font-mono" value={password} autoComplete="off"
            placeholder={`${MIN_PASSWORD_LENGTH}+ characters`} onChange={e => setPassword(e.target.value)}
            readOnly={!!made && made.email === email.trim().toLowerCase()} />
        </div>
      </div>

      <div>
        <label className="label-base">Role</label>
        <CrewRoleField value={role} onChange={setRole} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-base" htmlFor="nc-first">First name <span className="font-normal text-gray-400">(optional)</span></label>
          <input id="nc-first" className="input-base" value={first} autoComplete="off" onChange={e => setFirst(e.target.value)} />
        </div>
        <div>
          <label className="label-base" htmlFor="nc-last">Last name <span className="font-normal text-gray-400">(optional)</span></label>
          <input id="nc-last" className="input-base" value={last} autoComplete="off" onChange={e => setLast(e.target.value)} />
        </div>
      </div>

      {ok && (
        <p className="flex items-start gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {ok}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={createAndSend} disabled={!ready || !!busy || outOfEmails}
          className="btn-primary inline-flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-40">
          {busy === 'real' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {busy === 'real' ? 'Working…' : 'Create & send'}
        </button>
        <button type="button" onClick={testSend} disabled={!!busy || outOfEmails}
          className="btn-outline text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
          {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
          Send me one first
        </button>
      </div>
      {quotaNote}
      <p className="text-xs text-gray-400">
        The test goes to the GTS inbox and creates nothing. After a send the company stays filled in for the next boat.
      </p>
    </div>
  );
}
