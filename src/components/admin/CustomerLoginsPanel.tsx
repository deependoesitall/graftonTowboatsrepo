'use client';
// src/components/admin/CustomerLoginsPanel.tsx
// Boat crew login manager - set password (typed), quick-add, search.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, KeyRound, Loader2, Plus, Search, Ship, UserPlus,
} from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';

type Member = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  vessel_id: string | null;
  vessel_name: string | null;
  company_id: string | null;
  company_name: string | null;
};

type CompanyGroup = {
  id: string;
  name: string;
  vessels: { id: string; name: string; members: Member[] }[];
};

type Company = { id: string; name: string };
type Vessel = { id: string; name: string; company_id: string };

export function CustomerLoginsPanel() {
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyGroup[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwDone, setPwDone] = useState<string | null>(null);

  // Quick-add (existing boat)
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [allVessels, setAllVessels] = useState<Vessel[]>([]);
  const [qaCompanyId, setQaCompanyId] = useState('');
  const [qaVesselId, setQaVesselId] = useState('');
  const [qaFirst, setQaFirst] = useState('');
  const [qaLast, setQaLast] = useState('');
  const [qaEmail, setQaEmail] = useState('');
  const [qaPassword, setQaPassword] = useState('');
  const [qaRole, setQaRole] = useState<'cook' | 'captain' | 'other'>('cook');
  const [qaBusy, setQaBusy] = useState(false);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (q?.trim()) params.set('q', q.trim());
    const res = await adminFetch(`/api/admin/vessel-members?${params}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || 'Could not load logins');
      setCompanies([]);
    } else {
      setCompanies(json.companies || []);
    }
    setLoading(false);
  }, []);

  // Initial load + debounced search
  useEffect(() => {
    const t = setTimeout(() => load(search), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  const vesselOptions = useMemo(
    () => allVessels.filter(v => !qaCompanyId || v.company_id === qaCompanyId),
    [allVessels, qaCompanyId],
  );

  async function openQuickAdd() {
    setShowQuickAdd(true);
    setError(''); setOk('');
    const [cRes, vRes] = await Promise.all([
      adminFetch('/api/admin/companies'),
      adminFetch('/api/admin/vessels'),
    ]);
    const cJson = await cRes.json().catch(() => ({}));
    const vJson = await vRes.json().catch(() => ({}));
    if (cRes.ok) setAllCompanies(cJson.companies || []);
    if (vRes.ok) {
      setAllVessels((vJson.vessels || []).map((v: { id: string; name: string; company_id: string }) => ({
        id: v.id, name: v.name, company_id: v.company_id,
      })));
    }
  }

  async function setMemberPassword(member: Member) {
    if (!member.vessel_id) {
      setError('Missing boat for this login');
      return;
    }
    const next = pwValue.trim();
    if (next.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    setPwSaving(true);
    setError('');
    try {
      const res = await adminFetch(`/api/admin/vessels/${member.vessel_id}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: member.user_id, password: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not set password');
        return;
      }
      setPwDone(member.id);
      setOk(`Password set for ${member.display_name || member.email || 'crew member'}`);
      setTimeout(() => {
        setPwFor(null);
        setPwValue('');
        setPwDone(null);
      }, 2500);
    } finally {
      setPwSaving(false);
    }
  }

  async function quickAddMember() {
    setError(''); setOk('');
    if (!qaVesselId) { setError('Pick a boat'); return; }
    if (!qaFirst.trim() || !qaEmail.trim() || qaPassword.trim().length < 4) {
      setError('First name, email, and password (4+ chars) required');
      return;
    }
    setQaBusy(true);
    try {
      const res = await adminFetch(`/api/admin/vessels/${qaVesselId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: qaFirst.trim(),
          last_name: qaLast.trim(),
          email: qaEmail.trim(),
          password: qaPassword,
          role: qaRole,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Failed to add login');
        return;
      }
      setOk(`Login created for ${json.member?.display_name || qaEmail}`);
      setQaFirst(''); setQaLast(''); setQaEmail(''); setQaPassword('');
      setShowQuickAdd(false);
      await load(search);
    } finally {
      setQaBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-brand-gold/30 bg-brand-sand/30 px-5 py-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display font-bold text-brand-navy text-lg flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-brand-gold" /> Boat crew logins
          </h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Type a new password and read it to them on the phone. Crew can also reset themselves from
            Sign in → Forgot password.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openQuickAdd}
            className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
            <UserPlus className="w-4 h-4" /> Add login to boat
          </button>
          <Link href="/admin/customers/onboard"
            className="btn-primary text-sm px-3 py-2 flex items-center gap-1.5">
            <Ship className="w-4 h-4" /> New boat
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
      )}
      {ok && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm px-4 py-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {ok}
        </div>
      )}

      {showQuickAdd && (
        <div className="card-base p-5 space-y-4 border border-brand-river/20">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-brand-navy text-sm">Quick-add login (boat already exists)</h3>
            <button type="button" className="text-xs text-gray-400 hover:text-gray-600"
              onClick={() => setShowQuickAdd(false)}>Close</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label-base">Company</label>
              <select className="input-base" value={qaCompanyId}
                onChange={e => { setQaCompanyId(e.target.value); setQaVesselId(''); }}>
                <option value="">Select company…</option>
                {allCompanies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-base">Boat</label>
              <select className="input-base" value={qaVesselId}
                onChange={e => setQaVesselId(e.target.value)} disabled={!qaCompanyId && vesselOptions.length === 0}>
                <option value="">Select boat…</option>
                {vesselOptions.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <input className="input-base" placeholder="First name" value={qaFirst}
              onChange={e => setQaFirst(e.target.value)} />
            <input className="input-base" placeholder="Last name" value={qaLast}
              onChange={e => setQaLast(e.target.value)} />
            <input className="input-base sm:col-span-2" placeholder="Email" type="email" value={qaEmail}
              onChange={e => setQaEmail(e.target.value)} />
            <input className="input-base" placeholder="Password (type it — min 4)" type="text"
              value={qaPassword} onChange={e => setQaPassword(e.target.value)}
              autoComplete="new-password" />
            <select className="input-base" value={qaRole}
              onChange={e => setQaRole(e.target.value as typeof qaRole)}>
              <option value="cook">Cook</option>
              <option value="captain">Captain</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" className="btn-primary text-sm" disabled={qaBusy} onClick={quickAddMember}>
              {qaBusy ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : <Plus className="w-4 h-4 inline mr-1" />}
              Add login
            </button>
            <Link href="/admin/customers/onboard" className="text-sm text-brand-river hover:underline">
              Need a new boat? Open onboard wizard →
            </Link>
          </div>
        </div>
      )}

      <div className="card-base overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[14rem] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="search" className="input-base pl-9 text-sm"
              placeholder="Search name, email, boat, company…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button type="button" onClick={() => load(search)}
            className="btn-outline text-xs px-3 py-1.5">Refresh</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-brand-river">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : companies.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-gray-400">No crew logins yet.</p>
            <Link href="/admin/customers/onboard" className="btn-primary text-sm inline-flex items-center gap-1.5">
              <Ship className="w-4 h-4" /> Add customer / boat
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {companies.map(company => (
              <div key={company.id} className="px-5 py-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-brand-gold mb-3">
                  {company.name}
                </h3>
                <div className="space-y-4">
                  {company.vessels.map(vessel => (
                    <div key={vessel.id} className="rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                      <div className="px-4 py-2.5 bg-white border-b border-gray-100 flex items-center gap-2">
                        <Ship className="w-4 h-4 text-brand-river" />
                        <span className="font-semibold text-brand-navy text-sm">{vessel.name}</span>
                        <span className="text-xs text-gray-400 ml-auto">
                          {vessel.members.length} login{vessel.members.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <ul className="divide-y divide-gray-100">
                        {vessel.members.map(m => (
                          <li key={m.id} className="px-4 py-3 bg-white">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-brand-navy text-sm truncate">
                                  {m.display_name || m.email || 'Unnamed'}
                                </p>
                                <p className="text-xs text-gray-400 truncate">
                                  {m.email} · <span className="capitalize">{m.role}</span>
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = pwFor === m.id ? null : m.id;
                                  setPwFor(next);
                                  setPwValue('');
                                  setPwDone(null);
                                  setError('');
                                }}
                                className="text-xs font-bold uppercase tracking-wide text-brand-river hover:text-brand-navy"
                              >
                                {pwDone === m.id ? (
                                  <span className="text-green-600">✓ Password set</span>
                                ) : (
                                  'Set password'
                                )}
                              </button>
                            </div>
                            {pwFor === m.id && (
                              <div className="mt-3 space-y-2">
                                <div className="flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={pwValue}
                                    onChange={e => setPwValue(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && setMemberPassword(m)}
                                    placeholder="Type new password (min 4 chars)"
                                    className="input-base text-sm flex-1 min-w-[12rem]"
                                    autoComplete="new-password"
                                  />
                                  <button type="button" onClick={() => setMemberPassword(m)}
                                    disabled={pwSaving || pwValue.trim().length < 4}
                                    className="btn-primary text-xs px-3 py-2 disabled:opacity-50 whitespace-nowrap">
                                    {pwSaving ? 'Saving…' : 'Set password'}
                                  </button>
                                  <button type="button"
                                    onClick={() => { setPwFor(null); setPwValue(''); }}
                                    className="text-xs text-gray-400 hover:text-gray-600 px-2">
                                    Cancel
                                  </button>
                                </div>
                                <p className="text-[11px] text-gray-400 px-1">
                                  Type the new password. Give it to them now. They can change it under Password later —
                                  or use Forgot password on Sign in.
                                </p>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
