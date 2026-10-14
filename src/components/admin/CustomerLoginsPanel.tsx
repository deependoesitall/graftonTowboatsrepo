'use client';
// src/components/admin/CustomerLoginsPanel.tsx
// Boat crew logins. "+" by a boat adds a login, "+" by a company adds a boat,
// New company adds all three; each can send the welcome email in the same
// step. Any row can set a new password and resend.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2, CheckCircle2, KeyRound, Loader2, Plus, Search, Ship, Trash2,
} from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { AddCrewForm, type AddCrewDone } from '@/components/admin/AddCrewForm';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-rules';
import { OnboardSendCard, type OnboardCardData } from '@/components/admin/OnboardSendCard';
import { NewSignupsPanel, ctDay } from '@/components/admin/NewSignupsPanel';

type Member = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  signed_up_at?: string | null;
  last_sign_in_at?: string | null;
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

export function CustomerLoginsPanel() {
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyGroup[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  /**
   * The send card. The password is only ever in plain text between Jen typing
   * it and closing this card, so it opens right after a login is created
   * ('top') or a row's password is set (that member's id).
   */
  const [card, setCard] = useState<(OnboardCardData & { at: string }) | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Which "+" form is open: 'company', 'boat:<company id>' or 'login:<boat id>'. */
  const [adding, setAdding] = useState<string | null>(null);
  const [signupsKey, setSignupsKey] = useState(0);
  const { confirm, dialog } = useConfirm();
  // Login addresses that bounced or are blocked, from the Email list.
  const [bounced, setBounced] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    adminFetch('/api/admin/contacts?problems=1').then((r) => r.json())
      .then((j) => setBounced(new Map((j.problems || []).map((p: { email: string; status: string }) => [p.email, p.status]))))
      .catch(() => {});
  }, []);

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
      setOk('');
      setCard({
        at: member.id,
        name: member.display_name || '',
        email: member.email || '',
        vessel: member.vessel_name || '',
        password: next,
      });
      setPwFor(null);
      setPwValue('');
    } finally {
      setPwSaving(false);
    }
  }

  function openAdd(key: string) {
    setAdding(a => (a === key ? null : key));
    setError(''); setOk('');
  }

  async function added(r: AddCrewDone) {
    setAdding(null);
    setOk(r.message);
    setError(r.error || '');
    if (r.card && r.boatId) setCard({ ...r.card, at: `boat:${r.boatId}` });
    setSignupsKey(k => k + 1);
    await load(search);
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
            Tap + by a boat to add a login, or + by a company to add a boat. Crew can also reset
            their own password from Sign in → Forgot password.
          </p>
          <Link href="/admin/emails?tab=contacts&view=accounts" className="text-sm font-semibold text-brand-navy underline mt-1 inline-block">
            See every login in one list, and add them to the email list
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => openAdd('company')}
            className="btn-primary text-sm px-3 py-2 min-h-[44px] flex items-center gap-1.5">
            <Building2 className="w-4 h-4" /> New company
          </button>
          <Link href="/admin/customers/onboard"
            className="btn-outline text-sm px-3 py-2 min-h-[44px] flex items-center gap-1.5">
            <Ship className="w-4 h-4" /> From the deliveries ledger
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

      <NewSignupsPanel key={signupsKey} onLinked={() => load(search)} />

      {adding === 'company' && (
        <AddCrewForm mode={{ kind: 'company' }} onDone={added} onCancel={() => setAdding(null)} />
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
            <p className="text-sm text-gray-400">No boats or logins yet. Start with New company.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {companies.map(company => (
              <div key={company.id} className="px-5 py-4">
                <div className="flex items-center gap-1 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-brand-gold">{company.name}</h3>
                  {company.id !== '_none' && (
                    <button type="button" onClick={() => openAdd(`boat:${company.id}`)}
                      aria-label={`Add a boat to ${company.name}`} title={`Add a boat to ${company.name}`}
                      className="p-1.5 -my-1 rounded-full text-brand-gold hover:bg-brand-sand">
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  {adding === `boat:${company.id}` && (
                    <AddCrewForm mode={{ kind: 'boat', company: { id: company.id, name: company.name } }}
                      onDone={added} onCancel={() => setAdding(null)} />
                  )}
                  {company.vessels.map(vessel => (
                    <div key={vessel.id} className="rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                      <div className="px-4 py-2.5 bg-white border-b border-gray-100 flex items-center gap-2">
                        <Ship className="w-4 h-4 text-brand-river" />
                        <span className="font-semibold text-brand-navy text-sm">{vessel.name}</span>
                        {vessel.id !== '_none' && (
                          <button type="button" onClick={() => openAdd(`login:${vessel.id}`)}
                            aria-label={`Add a login to ${vessel.name}`} title={`Add a login to ${vessel.name}`}
                            className="p-1.5 -my-1 rounded-full text-brand-river hover:bg-gray-100">
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                        <span className="text-xs text-gray-400 ml-auto">
                          {vessel.members.length} login{vessel.members.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      {adding === `login:${vessel.id}` && (
                        <div className="p-3">
                          <AddCrewForm mode={{ kind: 'login', boat: { id: vessel.id, name: vessel.name } }}
                            onDone={added} onCancel={() => setAdding(null)} />
                        </div>
                      )}
                      {card?.at === `boat:${vessel.id}` && (
                        <div className="p-3">
                          <OnboardSendCard data={card} onClose={() => setCard(null)} />
                        </div>
                      )}
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
                                {m.email && bounced.has(m.email.toLowerCase()) && (
                                  <Link href="/admin/emails?tab=contacts&status=problem"
                                    className="inline-block mt-0.5 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 hover:bg-red-100">
                                    Email {bounced.get(m.email.toLowerCase()) === 'suppressed' ? 'blocked' : 'bounced'} · fix it
                                  </Link>
                                )}
                                {m.signed_up_at && (
                                  <p className="text-[11px] text-gray-400">
                                    Signed up {ctDay(m.signed_up_at)} · {m.last_sign_in_at ? `Last sign-in ${ctDay(m.last_sign_in_at)}` : 'Never signed in'}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = pwFor === m.id ? null : m.id;
                                    setPwFor(next);
                                    setPwValue('');
                                    setError('');
                                  }}
                                  className="text-xs font-bold uppercase tracking-wide text-brand-river hover:text-brand-navy"
                                >
                                  Send onboarding
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
                                    {pwSaving ? 'Saving…' : 'Set & continue'}
                                  </button>
                                  <button type="button"
                                    onClick={() => { setPwFor(null); setPwValue(''); }}
                                    className="text-xs text-gray-400 hover:text-gray-600 px-2">
                                    Cancel
                                  </button>
                                </div>
                                <p className="text-[11px] text-gray-400 px-1">
                                  Type a new password. Their old one stops working. Next you can email it, copy it, or read it to them.
                                </p>
                              </div>
                            )}
                            {card?.at === m.id && (
                              <div className="mt-3">
                                <OnboardSendCard data={card} onClose={() => setCard(null)} />
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
