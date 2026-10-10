'use client';
// src/components/admin/NewSignupsPanel.tsx
//
// Customers → Logins: people who made their own account on the site and
// aren't on a boat yet. Link puts them on the company / boat they typed
// (made if new) or one Jen picks, without touching their password.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, UserCheck } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { CrewRoleField } from '@/components/admin/CrewRoleField';

type Signup = {
  user_id: string;
  email: string | null;
  signed_up_at: string | null;
  last_sign_in_at: string | null;
  name: string | null;
  company_name: string | null;
  vessel_name: string | null;
};
type Company = { id: string; name: string };
type Vessel = { id: string; name: string; company_id: string };

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const WEEK = 7 * 24 * 60 * 60 * 1000;

/** "Oct 6, 2026" in Central time. */
export function ctDay(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' });
}

export function NewSignupsPanel({ onLinked }: { onLinked: () => void }) {
  const [signups, setSignups] = useState<Signup[] | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [company, setCompany] = useState('');
  const [boat, setBoat] = useState('');
  const [role, setRole] = useState('cook');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await adminFetch('/api/admin/signups');
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setSignups(j.signups || []); setError(''); }
    else setError(j.error || 'Could not load new sign-ups.');
  }, []);
  useEffect(() => { load(); }, [load]);

  async function openLink(s: Signup) {
    setOpen(s.user_id); setOk(''); setError('');
    setCompany(s.company_name || '');
    setBoat(s.vessel_name || '');
    setRole('cook');
    if (!companies.length) {
      const [cRes, vRes] = await Promise.all([adminFetch('/api/admin/companies'), adminFetch('/api/admin/vessels')]);
      const c = await cRes.json().catch(() => ({}));
      const v = await vRes.json().catch(() => ({}));
      if (cRes.ok) setCompanies((c.companies || []).map((x: Company) => ({ id: x.id, name: x.name })));
      if (vRes.ok) setVessels((v.vessels || []).map((x: Vessel) => ({ id: x.id, name: x.name, company_id: x.company_id })));
    }
  }

  const pickedCompany = useMemo(() => companies.find(c => key(c.name) === key(company)) || null, [companies, company]);
  const companyBoats = useMemo(() => (pickedCompany ? vessels.filter(v => v.company_id === pickedCompany.id) : []), [vessels, pickedCompany]);
  const pickedBoat = useMemo(() => companyBoats.find(v => key(v.name) === key(boat)) || null, [companyBoats, boat]);

  async function link(s: Signup) {
    if (!company.trim() || !boat.trim()) { setError('Type or pick the company and the boat.'); return; }
    setBusy(true); setError(''); setOk('');
    try {
      // Anything made is added to the lists, so a retry finds it.
      let companyId = pickedCompany?.id || '';
      let companyName = pickedCompany?.name || company.trim();
      if (!companyId) {
        const res = await adminFetch('/api/admin/companies', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: company.trim() }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.company?.id) { setError(j.error || 'Could not add the company.'); return; }
        companyId = j.company.id; companyName = j.company.name;
        setCompanies(list => [...list, { id: companyId, name: companyName }]);
        setCompany(companyName);
      }
      let vesselId = pickedBoat?.id || '';
      let vesselName = pickedBoat?.name || boat.trim();
      if (!vesselId) {
        const res = await adminFetch('/api/admin/vessels', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_id: companyId, name: boat.trim(), backfill_orders: true }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.vessel?.id) { setError(j.error || 'Could not add the boat.'); return; }
        vesselId = j.vessel.id; vesselName = j.vessel.name;
        setVessels(list => list.some(v => v.id === vesselId) ? list : [...list, { id: vesselId, name: vesselName, company_id: companyId }]);
        setBoat(vesselName);
      }
      const res = await adminFetch('/api/admin/signups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: s.user_id, vessel_id: vesselId, role }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || 'Could not link the account.'); return; }
      setOk(`${s.email} is now on ${vesselName}, ${companyName}.`);
      setOpen(null);
      await load();
      onLinked();
    } finally {
      setBusy(false);
    }
  }

  if (signups === null && !error) return null;
  const now = Date.now();

  return (
    <div className="card-base overflow-hidden border border-brand-gold/30">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
        <UserCheck className="w-4 h-4 text-brand-gold" />
        <h3 className="font-bold text-brand-navy text-sm">New sign-ups</h3>
        <span className="text-xs text-gray-400">Made their own account, not on a boat yet</span>
        <span className="ml-auto text-xs font-semibold text-gray-500">{signups?.length ?? 0}</span>
      </div>
      {error && <p className="px-5 pt-3 text-sm text-red-600">{error}</p>}
      {ok && <p className="px-5 pt-3 text-sm text-emerald-700">{ok}</p>}
      {signups && signups.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400">No one waiting. New accounts show up here.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {(signups || []).map(s => {
            const isNew = !!s.signed_up_at && now - Date.parse(s.signed_up_at) < WEEK;
            const typed = [s.vessel_name, s.company_name].filter(Boolean).join(', ');
            return (
              <li key={s.user_id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-navy text-sm truncate flex items-center gap-2">
                      {s.name || s.email}
                      {isNew && <span className="rounded-full bg-brand-orange text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">New</span>}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {s.name ? `${s.email} · ` : ''}{typed ? `Typed: ${typed}` : 'No company or boat typed'}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Signed up {ctDay(s.signed_up_at)} · {s.last_sign_in_at ? `Last sign-in ${ctDay(s.last_sign_in_at)}` : 'Never signed in'}
                    </p>
                  </div>
                  <button type="button" onClick={() => (open === s.user_id ? setOpen(null) : openLink(s))}
                    className="text-xs font-bold uppercase tracking-wide text-brand-river hover:text-brand-navy inline-flex items-center gap-1">
                    <Link2 className="w-3.5 h-3.5" /> Link to boat
                  </button>
                </div>
                {open === s.user_id && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label-base">Company</label>
                        <input className="input-base" list="su-companies" value={company} autoComplete="off"
                          onChange={e => setCompany(e.target.value)} />
                        <datalist id="su-companies">{companies.map(c => <option key={c.id} value={c.name} />)}</datalist>
                        {company.trim() && <p className="text-[11px] text-gray-400 mt-1">{pickedCompany ? 'Existing company' : 'New company'}</p>}
                      </div>
                      <div>
                        <label className="label-base">Boat</label>
                        <input className="input-base" list="su-boats" value={boat} autoComplete="off"
                          onChange={e => setBoat(e.target.value)} />
                        <datalist id="su-boats">{companyBoats.map(v => <option key={v.id} value={v.name} />)}</datalist>
                        {boat.trim() && <p className="text-[11px] text-gray-400 mt-1">{pickedBoat ? 'Existing boat' : 'New boat'}</p>}
                      </div>
                    </div>
                    <CrewRoleField value={role} onChange={setRole} />
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => link(s)} disabled={busy || !company.trim() || !boat.trim()}
                        className="btn-primary text-sm min-h-[40px] inline-flex items-center gap-1.5 disabled:opacity-50">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Link
                      </button>
                      <button type="button" onClick={() => setOpen(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2">Cancel</button>
                      <span className="text-[11px] text-gray-400">Their password stays as they set it.</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
