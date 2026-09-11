'use client';
// src/app/admin/customers/onboard/page.tsx
// Company → boat → crew logins. Pick boats from the deliveries ledger when they already exist.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Ship, UserPlus, CheckCircle2 } from 'lucide-react';
import { adminFetch, fetchAdminSession, canAccess } from '@/lib/admin-auth';
import { useRouter } from 'next/navigation';

interface Company { id: string; name: string; is_active?: boolean }
interface Vessel {
  id: string; name: string; company_id: string;
  company?: { id: string; name: string } | null;
  members?: Member[];
}
interface Member {
  id: string; email: string | null; display_name: string | null;
  role: string; user_id: string;
}
interface LedgerBoat {
  name_key: string;
  name: string;
  delivery_count: number;
  vessel_id: string | null;
  already_linked: boolean;
}

const TYPE_NEW = '__type_new__';

export default function OnboardBoatPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [ledgerBoats, setLedgerBoats] = useState<LedgerBoat[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerPick, setLedgerPick] = useState(''); // name_key or TYPE_NEW or ''
  const [vesselName, setVesselName] = useState('');
  const [vessel, setVessel] = useState<Vessel | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'cook' | 'captain' | 'other'>('cook');

  useEffect(() => {
    (async () => {
      const s = await fetchAdminSession();
      if (!s || !canAccess(s.role, 'reports')) {
        router.replace('/admin');
        return;
      }
      setReady(true);
    })();
  }, [router]);

  const loadCompanies = useCallback(async () => {
    const res = await adminFetch('/api/admin/companies');
    const json = await res.json();
    if (res.ok) setCompanies(json.companies || []);
  }, []);

  const loadLedgerBoats = useCallback(async (cid: string) => {
    if (!cid) {
      setLedgerBoats([]);
      return;
    }
    setLedgerLoading(true);
    try {
      const res = await adminFetch(`/api/admin/vessels/ledger?company_id=${encodeURIComponent(cid)}`);
      const json = await res.json();
      if (res.ok) setLedgerBoats(json.boats || []);
      else setLedgerBoats([]);
    } catch {
      setLedgerBoats([]);
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  useEffect(() => { if (ready) loadCompanies(); }, [ready, loadCompanies]);

  useEffect(() => {
    setLedgerPick('');
    setVesselName('');
    setVessel(null);
    setMembers([]);
    if (companyId) void loadLedgerBoats(companyId);
    else setLedgerBoats([]);
  }, [companyId, loadLedgerBoats]);

  function onLedgerPick(value: string) {
    setLedgerPick(value);
    setError(''); setOk('');
    if (!value || value === TYPE_NEW) {
      setVesselName('');
      return;
    }
    const boat = ledgerBoats.find(b => b.name_key === value);
    if (boat) setVesselName(boat.name);
  }

  const pickedFromLedger = !!ledgerPick && ledgerPick !== TYPE_NEW;
  const linkLabel = pickedFromLedger || ledgerBoats.some(b => b.name.toLowerCase() === vesselName.trim().toLowerCase())
    ? 'Link boat'
    : 'Create boat';

  async function createCompany() {
    setError(''); setOk('');
    if (!newCompanyName.trim()) { setError('Company name required'); return; }
    setBusy(true);
    try {
      const res = await adminFetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCompanyName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to create company'); return; }
      await loadCompanies();
      setCompanyId(json.company.id);
      setNewCompanyName('');
      setOk(`Company ${json.company.name} ready`);
    } finally { setBusy(false); }
  }

  async function linkOrCreateVessel() {
    setError(''); setOk('');
    if (!companyId) { setError('Pick a company first'); return; }
    if (!vesselName.trim()) { setError('Boat name required'); return; }
    setBusy(true);
    try {
      const res = await adminFetch('/api/admin/vessels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          name: vesselName.trim(),
          backfill_orders: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to link boat'); return; }
      setVessel(json.vessel);
      setMembers(json.vessel.members || []);
      const n = json.linked_orders || 0;
      const verb = json.created ? 'created' : 'linked';
      setOk(
        n > 0
          ? `Boat ${json.vessel.name} ${verb} · attached ${n} past order${n === 1 ? '' : 's'}`
          : `Boat ${json.vessel.name} ${verb}`,
      );
      await loadLedgerBoats(companyId);
    } finally { setBusy(false); }
  }

  async function addMember() {
    setError(''); setOk('');
    if (!vessel) { setError('Link or create the boat first'); return; }
    if (!firstName.trim() || !email.trim() || password.trim().length < 4) {
      setError('First name, email, and password (4+ chars) required');
      return;
    }
    setBusy(true);
    try {
      const res = await adminFetch(`/api/admin/vessels/${vessel.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          password,
          role,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to add login'); return; }
      setMembers(m => [...m, json.member]);
      setFirstName(''); setLastName(''); setEmail(''); setPassword('');
      setOk(`Login created for ${json.member.display_name || json.member.email}`);
    } finally { setBusy(false); }
  }

  if (!ready) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-brand-green/60">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const companyLabel = companies.find(c => c.id === companyId)?.name
    || vessel?.company?.name
    || '';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/customers" className="text-brand-green/70 hover:text-brand-green">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-display font-bold text-brand-navy text-2xl">Add customer / boat</h1>
          <p className="text-sm text-brand-green/60 mt-0.5">
            Company → boat → crew logins. Shared history for everyone on the boat.
          </p>
        </div>
      </div>

      {(vessel || companyLabel) && (
        <div className="rounded-xl border border-brand-gold/30 bg-brand-sand/40 px-4 py-3 flex items-center gap-3">
          <Ship className="w-5 h-5 text-brand-green shrink-0" />
          <div className="text-sm">
            <span className="font-bold text-brand-navy">{companyLabel || '—'}</span>
            <span className="text-brand-green/40 mx-2">·</span>
            <span className="font-bold text-brand-navy">{vessel?.name || 'Boat not linked yet'}</span>
            {members.length > 0 && (
              <>
                <span className="text-brand-green/40 mx-2">·</span>
                <span className="text-brand-green/80">{members.length} login{members.length === 1 ? '' : 's'}</span>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
      )}
      {ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm px-4 py-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {ok}
        </div>
      )}

      {/* Step 1 — Company */}
      <section className="bg-white rounded-2xl border border-brand-green/10 p-5 space-y-4">
        <h2 className="font-display font-bold text-brand-navy text-lg">1. Company</h2>
        <p className="text-xs text-brand-green/50">Who we bill. Ingram, Artco, Reliant…</p>
        <select
          className="input-base"
          value={companyId}
          onChange={e => setCompanyId(e.target.value)}
        >
          <option value="">Select company…</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-[11px] font-bold uppercase tracking-widest text-brand-green/50">Or add new</label>
            <input className="input-base mt-1" placeholder="New company name"
              value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} />
          </div>
          <button type="button" className="btn-outline text-sm px-3 py-2" disabled={busy} onClick={createCompany}>
            <Plus className="w-4 h-4 inline mr-1" /> Add
          </button>
        </div>
      </section>

      {/* Step 2 — Boat */}
      <section className="bg-white rounded-2xl border border-brand-green/10 p-5 space-y-4">
        <h2 className="font-display font-bold text-brand-navy text-lg">2. Boat</h2>
        <p className="text-xs text-brand-green/50">
          Boats already on the deliveries ledger for this company show up here — you&apos;re linking a login anchor, not inventing history.
        </p>

        {companyId && (
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-brand-green/50">
              From deliveries
            </label>
            <select
              className="input-base mt-1"
              value={ledgerPick}
              onChange={e => onLedgerPick(e.target.value)}
              disabled={!!vessel || ledgerLoading}
            >
              <option value="">
                {ledgerLoading ? 'Loading boats…' : ledgerBoats.length ? 'Pick a known boat…' : 'No ledger boats yet — type a name'}
              </option>
              {ledgerBoats.map(b => (
                <option key={b.name_key} value={b.name_key}>
                  {b.name}
                  {b.delivery_count ? ` · ${b.delivery_count} deliver${b.delivery_count === 1 ? 'y' : 'ies'}` : ''}
                  {b.already_linked ? ' · linked' : ''}
                </option>
              ))}
              <option value={TYPE_NEW}>Type a new boat name…</option>
            </select>
          </div>
        )}

        {(ledgerPick === TYPE_NEW || !companyId || (!ledgerLoading && ledgerBoats.length === 0) || (!!ledgerPick && ledgerPick !== TYPE_NEW)) && (
          <div>
            {(ledgerPick === TYPE_NEW || (!ledgerBoats.length && companyId)) && (
              <label className="text-[11px] font-bold uppercase tracking-widest text-brand-green/50">
                Boat name
              </label>
            )}
            <input
              className={`input-base ${ledgerPick === TYPE_NEW || (!ledgerBoats.length && companyId) ? 'mt-1' : ''}`}
              placeholder="Scott Noble"
              value={vesselName}
              onChange={e => {
                setVesselName(e.target.value);
                if (ledgerPick && ledgerPick !== TYPE_NEW) setLedgerPick(TYPE_NEW);
              }}
              disabled={!!vessel || (pickedFromLedger && !!vesselName && ledgerPick !== TYPE_NEW)}
              readOnly={pickedFromLedger && ledgerPick !== TYPE_NEW}
            />
          </div>
        )}

        {!vessel ? (
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={busy || !companyId || !vesselName.trim()}
            onClick={linkOrCreateVessel}
          >
            {linkLabel}
          </button>
        ) : (
          <p className="text-sm text-emerald-700 font-medium">Boat locked in — add crew logins below.</p>
        )}
      </section>

      {/* Step 3 — Members */}
      <section className="bg-white rounded-2xl border border-brand-green/10 p-5 space-y-4">
        <h2 className="font-display font-bold text-brand-navy text-lg flex items-center gap-2">
          <UserPlus className="w-5 h-5" /> 3. Crew logins
        </h2>
        <p className="text-xs text-brand-green/50">
          Anyone on the boat who orders — cook, captain, steward, whoever. Separate emails and passwords, shared boat history.
          Type a password (browsers may suggest one — that is fine). You can also set or reset a crew member&apos;s password later from Customers → Logins.
        </p>

        {members.length > 0 && (
          <ul className="divide-y divide-brand-green/10 rounded-xl border border-brand-green/10 overflow-hidden">
            {members.map(m => (
              <li key={m.id} className="px-4 py-3 flex justify-between text-sm bg-white">
                <span className="font-medium text-brand-navy">{m.display_name || m.email}</span>
                <span className="text-brand-green/50">{m.role} · {m.email}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <input className="input-base" placeholder="First name" value={firstName}
            onChange={e => setFirstName(e.target.value)} disabled={!vessel} />
          <input className="input-base" placeholder="Last name" value={lastName}
            onChange={e => setLastName(e.target.value)} disabled={!vessel} />
          <input className="input-base sm:col-span-2" placeholder="Email" type="email" value={email}
            onChange={e => setEmail(e.target.value)} disabled={!vessel} />
          <input className="input-base" placeholder="Password (type it)" type="text" value={password}
            onChange={e => setPassword(e.target.value)} disabled={!vessel} autoComplete="new-password" />
          <select className="input-base" value={role} onChange={e => setRole(e.target.value as typeof role)} disabled={!vessel}>
            <option value="cook">Cook</option>
            <option value="captain">Captain</option>
            <option value="other">Other</option>
          </select>
        </div>
        <button type="button" className="btn-primary text-sm" disabled={busy || !vessel} onClick={addMember}>
          Add login
        </button>
      </section>

      <p className="text-center text-sm text-brand-green/50 pb-4">
        Done? <Link href="/admin/customers" className="text-brand-river font-semibold hover:underline">Back to Customers</Link>
        {' · '}
        <Link href="/admin/customers?tab=logins" className="text-brand-river font-semibold hover:underline">Manage logins</Link>
      </p>
    </div>
  );
}
