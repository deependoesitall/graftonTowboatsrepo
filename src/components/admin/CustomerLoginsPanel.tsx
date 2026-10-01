'use client';
// src/components/admin/CustomerLoginsPanel.tsx
// Boat crew login manager - set password (typed), quick-add, search.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, KeyRound, Loader2, Mail, Plus, Search, Ship, Trash2, UserPlus,
} from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { CrewRoleField } from '@/components/admin/CrewRoleField';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-rules';

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

  /**
   * THE WELCOME EMAIL HAS TO BE OFFERED HERE, NOT ON A SEPARATE SCREEN.
   *
   * The password is only ever in plain text for the few seconds between Jen
   * typing it and the server hashing it. Nothing can read it back afterwards,
   * so the one moment the email can carry it is right after it is set. Send it
   * later and she has to invent a second password and tell the crew twice.
   */
  const [welcome, setWelcome] = useState<
    { memberId: string; name: string; email: string; vessel: string; password: string } | null
  >(null);
  const [welcomeSending, setWelcomeSending] = useState(false);
  const [welcomeSentTo, setWelcomeSentTo] = useState('');
  const [signin, setSignin] = useState<
    { memberId: string; name: string; email: string; vessel: string; password: string } | null
  >(null);
  const [signinSending, setSigninSending] = useState(false);
  const [signinSentTo, setSigninSentTo] = useState('');

  async function sendWelcome() {
    if (!welcome) return;
    setWelcomeSending(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/customer-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: 'welcome',
          to: [welcome.email],
          vars: {
            firstName: welcome.name.split(/\s+/)[0] || '',
            vesselName: welcome.vessel,
            loginEmail: welcome.email,
            password: welcome.password,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not send the welcome email.');
        return;
      }
      setWelcomeSentTo(welcome.email);
      setWelcome(null);
      setTimeout(() => setWelcomeSentTo(''), 7000);
    } finally {
      setWelcomeSending(false);
    }
  }

  async function sendSignIn() {
    if (!signin) return;
    setSigninSending(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/customer-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: 'signin',
          to: [signin.email],
          vars: {
            firstName: signin.name.split(/\s+/)[0] || '',
            vesselName: signin.vessel,
            loginEmail: signin.email,
            password: signin.password,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not send the sign-in email.');
        return;
      }
      setSigninSentTo(signin.email);
      setSignin(null);
      setTimeout(() => setSigninSentTo(''), 7000);
    } finally {
      setSigninSending(false);
    }
  }

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
  const [qaRole, setQaRole] = useState('cook');
  const [qaBusy, setQaBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

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
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
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
      if (member.email) {
        setSignin({
          memberId: member.id,
          name: member.display_name || '',
          email: member.email,
          vessel: member.vessel_name || '',
          password: next,
        });
      }
      // Deliberately NOT auto-closing any more. The panel stays open holding
      // the password so the welcome email can still be sent from here.
      setPwValue('');
    } finally {
      setPwSaving(false);
    }
  }

  async function quickAddMember() {
    setError(''); setOk('');
    if (!qaVesselId) { setError('Pick a boat'); return; }
    if (!qaFirst.trim() || !qaEmail.trim() || qaPassword.trim().length < MIN_PASSWORD_LENGTH) {
      setError(`First name, email, and password (${MIN_PASSWORD_LENGTH}+ chars) required`);
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
      setWelcome({
        memberId: json.member?.id || qaEmail,
        name: `${qaFirst.trim()} ${qaLast.trim()}`.trim(),
        email: qaEmail.trim(),
        vessel: allVessels.find(v => v.id === qaVesselId)?.name || '',
        password: qaPassword,
      });
      setQaFirst(''); setQaLast(''); setQaEmail(''); setQaPassword('');
      setQaRole('cook');
      setShowQuickAdd(false);
      await load(search);
    } finally {
      setQaBusy(false);
    }
  }

  async function deleteMember(member: Member) {
    if (!member.vessel_id) {
      setError('Missing boat for this login');
      return;
    }
    const ok = await confirm({
      title: 'Delete this login?',
      message: 'They will not be able to sign in. Boat order history stays.',
      danger: true,
      actions: [{ id: 'ok', label: 'Delete login', variant: 'danger' }],
    });
    if (!ok) return;
    setDeletingId(member.id);
    setError('');
    setOk('');
    try {
      const res = await adminFetch(`/api/admin/vessels/${member.vessel_id}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: member.user_id, member_id: member.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not delete login');
        return;
      }
      setOk(`Login removed for ${member.display_name || member.email || 'crew member'}`);
      await load(search);
    } finally {
      setDeletingId(null);
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

      {welcomeSentTo && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm px-4 py-3 flex items-center gap-2">
          <Mail className="w-4 h-4 shrink-0" /> Welcome email sent to {welcomeSentTo}.
        </div>
      )}
      {signinSentTo && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm px-4 py-3 flex items-center gap-2">
          <Mail className="w-4 h-4 shrink-0" /> Sign-in email sent to {signinSentTo}.
        </div>
      )}

      {welcome && (
        <div className="rounded-xl border border-brand-gold/40 bg-brand-yellow/20 px-4 py-3.5">
          <p className="text-sm font-bold text-brand-navy">
            Send {welcome.name.split(/\s+/)[0] || 'them'} the welcome email?
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-brand-navy/80">
            It carries the sign in, the password you just set, and a walk-through of
            how to order. Going to <b className="break-all">{welcome.email}</b>
            {welcome.vessel ? <> for the <b>{welcome.vessel}</b></> : null}.
          </p>
          <p className="mt-1.5 text-xs text-brand-navy/60">
            This is the only chance to send it with that password. Once you leave
            this screen the password cannot be read back, and you would have to set
            a new one.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={sendWelcome} disabled={welcomeSending}
              className="btn-primary text-xs px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-50">
              {welcomeSending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Mail className="w-3.5 h-3.5" />}
              {welcomeSending ? 'Sending…' : 'Send welcome email'}
            </button>
            <button type="button" onClick={() => setWelcome(null)}
              className="text-xs font-semibold text-brand-navy/50 hover:text-brand-navy px-2">
              Not now
            </button>
          </div>
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
              onChange={e => setQaFirst(e.target.value)} autoComplete="off" />
            <input className="input-base" placeholder="Last name" value={qaLast}
              onChange={e => setQaLast(e.target.value)} autoComplete="off" />
            <input className="input-base sm:col-span-2" placeholder="Email" type="email" value={qaEmail}
              onChange={e => setQaEmail(e.target.value)} autoComplete="off" />
            <input className="input-base" placeholder={`Password (type it — min ${MIN_PASSWORD_LENGTH})`} type="text"
              value={qaPassword} onChange={e => setQaPassword(e.target.value)}
              autoComplete="off" minLength={MIN_PASSWORD_LENGTH} />
            <div className="sm:col-span-2">
              <p className="label-base mb-1.5">Role</p>
              <CrewRoleField value={qaRole} onChange={setQaRole} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" className="btn-primary text-sm" disabled={qaBusy || !qaVesselId || !qaFirst.trim() || !qaEmail.trim() || qaPassword.trim().length < MIN_PASSWORD_LENGTH} onClick={quickAddMember}>
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
                              <div className="flex items-center gap-3 shrink-0">
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
                                <button
                                  type="button"
                                  onClick={() => deleteMember(m)}
                                  disabled={deletingId === m.id}
                                  className="text-xs font-bold uppercase tracking-wide text-red-600 hover:text-red-800 disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  {deletingId === m.id ? 'Deleting…' : 'Delete'}
                                </button>
                              </div>
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
                                    placeholder={`Type new password (min ${MIN_PASSWORD_LENGTH} chars)`}
                                    className="input-base text-sm flex-1 min-w-[12rem]"
                                    autoComplete="off"
                                  />
                                  <button type="button" onClick={() => setMemberPassword(m)}
                                    disabled={pwSaving || pwValue.trim().length < MIN_PASSWORD_LENGTH}
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
                                  Type the new password. Give it to them now, or send it in an email.
                                </p>
                              </div>
                            )}
                            {signin && signin.memberId === m.id && (
                              <div className="mt-3 rounded-lg border border-brand-gold/40 bg-brand-yellow/20 px-3 py-2.5">
                                <p className="text-sm font-bold text-brand-navy">
                                  Send {signin.name.split(/\s+/)[0] || 'them'} their sign-in?
                                </p>
                                <p className="mt-0.5 text-[12px] leading-snug text-brand-navy/80">
                                  Website, their email, and this password — the same card as the welcome email.
                                  Going to <b className="break-all">{signin.email}</b>.
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <button type="button" onClick={sendSignIn} disabled={signinSending}
                                    className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50">
                                    {signinSending
                                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      : <Mail className="w-3.5 h-3.5" />}
                                    {signinSending ? 'Sending…' : 'Send sign-in email'}
                                  </button>
                                  <button type="button" onClick={() => setSignin(null)}
                                    className="text-xs font-semibold text-brand-navy/50 hover:text-brand-navy px-2">
                                    Not now
                                  </button>
                                </div>
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
      {dialog}
    </div>
  );
}
