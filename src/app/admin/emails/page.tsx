'use client';
// src/app/admin/emails/page.tsx
//
// The two emails Jen sends by hand, laid out as three steps she works down:
// pick one, pick or create the login, send it. The preview on the right is
// built by the same function the send uses, so what she approves is what
// the customer gets.
//
// Asked for on the Sep 21 call, so she stops rebuilding the same Gmail draft
// and attaching Sinclair's 25 page spreadsheet.
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Mail, Send, Loader2, CheckCircle2, AlertTriangle, UserPlus, Megaphone,
  Monitor, Smartphone, X, FlaskConical, Search, Ship,
} from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { CrewRoleField } from '@/components/admin/CrewRoleField';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-rules';

type TemplateKey = 'welcome' | 'announcement';

const TEMPLATES: Record<TemplateKey, {
  title: string; who: string; carries: string; Icon: typeof Mail;
}> = {
  welcome: {
    title: 'New customer',
    who: 'One person',
    carries: 'Their sign in, the password you set, and a walk-through of how to order.',
    Icon: UserPlus,
  },
  announcement: {
    title: 'Announcement',
    who: 'Everybody',
    carries: "What the platform does, Sinclair's sale prices, and a link to the store.",
    Icon: Megaphone,
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type MemberHit = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  vessel_id: string | null;
  vessel_name: string | null;
  company_name: string | null;
};

type VesselOpt = { id: string; name: string; company_id: string | null; company_name: string };

function Step({ n, title, hint, children }: {
  n: number; title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <section className="flex gap-3">
      <div className="shrink-0 w-7 h-7 rounded-full bg-brand-navy text-brand-yellow grid place-items-center text-[13px] font-bold">
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-bold text-brand-navy leading-7">{title}</h2>
        {hint && <p className="text-[13px] text-gray-500 mb-2.5 leading-relaxed">{hint}</p>}
        {children}
      </div>
    </section>
  );
}

export default function EmailsPage() {
  const [template, setTemplate] = useState<TemplateKey>('welcome');
  const [vars, setVars] = useState({ firstName: '', vesselName: '', loginEmail: '', password: '' });
  const [to, setTo] = useState('');
  const [html, setHtml] = useState('');
  const [subject, setSubject] = useState('');
  const [width, setWidth] = useState<'phone' | 'desktop'>('desktop');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [sending, setSending] = useState<'' | 'real' | 'test'>('');
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');

  const [memberQuery, setMemberQuery] = useState('');
  const [members, setMembers] = useState<MemberHit[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [picked, setPicked] = useState<MemberHit | null>(null);
  const [creating, setCreating] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [vessels, setVessels] = useState<VesselOpt[]>([]);
  const [qaCompany, setQaCompany] = useState('');
  const [qaVesselId, setQaVesselId] = useState('');
  const [qaFirst, setQaFirst] = useState('');
  const [qaLast, setQaLast] = useState('');
  const [qaEmail, setQaEmail] = useState('');
  const [qaPassword, setQaPassword] = useState('');
  const [qaRole, setQaRole] = useState('cook');
  const [pwMismatch, setPwMismatch] = useState(false);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    const qs = new URLSearchParams({ template, ...vars });
    try {
      const res = await adminFetch(`/api/admin/customer-email?${qs.toString()}`);
      const j = await res.json();
      if (res.ok) { setHtml(j.html); setSubject(j.subject); }
      else setError(j.error || 'Could not build the preview.');
    } catch {
      setError('Could not build the preview.');
    } finally {
      setLoadingPreview(false);
    }
  }, [template, vars]);

  // Debounced so typing a name doesn't fire a request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(loadPreview, 250);
    return () => window.clearTimeout(t);
  }, [loadPreview]);

  const loadMembers = useCallback(async (q: string) => {
    setMembersLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    const res = await adminFetch(`/api/admin/vessel-members?${params}`);
    const json = await res.json().catch(() => ({}));
    if (res.ok) setMembers(json.members || []);
    setMembersLoading(false);
  }, []);

  useEffect(() => {
    if (template !== 'welcome') return;
    const t = window.setTimeout(() => loadMembers(memberQuery), memberQuery ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [template, memberQuery, loadMembers]);

  async function loadVessels() {
    if (vessels.length) return;
    const res = await adminFetch('/api/admin/vessels');
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const rows = (json.vessels || []) as Array<{
      id: string; name: string; company_id: string | null;
      company?: { id?: string; name?: string } | { id?: string; name?: string }[] | null;
    }>;
    setVessels(rows.map(v => {
      const c = Array.isArray(v.company) ? v.company[0] : v.company;
      return {
        id: v.id,
        name: v.name,
        company_id: v.company_id || c?.id || null,
        company_name: c?.name || 'Unassigned company',
      };
    }));
  }

  const companies = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vessels) {
      const id = v.company_id || v.company_name;
      if (!map.has(id)) map.set(id, v.company_name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [vessels]);

  const vesselOptions = useMemo(
    () => vessels.filter(v => !qaCompany || v.company_id === qaCompany || v.company_name === qaCompany),
    [vessels, qaCompany],
  );

  function applyMember(m: MemberHit, password = '') {
    const first = (m.display_name || '').trim().split(/\s+/)[0] || '';
    setPicked(m);
    setCreating(false);
    setPwMismatch(false);
    setVars({
      firstName: first,
      vesselName: m.vessel_name || '',
      loginEmail: m.email || '',
      password,
    });
    setTo(m.email || '');
  }

  function startCreate() {
    setCreating(true);
    setPicked(null);
    setQaFirst(''); setQaLast(''); setQaEmail(''); setQaPassword('');
    setQaRole('cook'); setQaCompany(''); setQaVesselId('');
    setVars({ firstName: '', vesselName: '', loginEmail: '', password: '' });
    setTo('');
    loadVessels();
  }

  function fillCreatePreview(patch: Partial<{ first: string; vessel: string; email: string; password: string }>) {
    const first = patch.first ?? qaFirst;
    const vesselId = patch.vessel ?? qaVesselId;
    const email = patch.email ?? qaEmail;
    const password = patch.password ?? qaPassword;
    const boat = vessels.find(v => v.id === vesselId)?.name || '';
    setVars({
      firstName: first.trim(),
      vesselName: boat,
      loginEmail: email.trim(),
      password,
    });
    if (email.trim()) setTo(email.trim());
  }

  async function createLogin(): Promise<MemberHit | null> {
    if (!qaVesselId) { setError('Pick a boat.'); return null; }
    if (!qaFirst.trim() || !qaEmail.trim() || qaPassword.trim().length < MIN_PASSWORD_LENGTH) {
      setError(`First name, email, and a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return null;
    }
    setCreateBusy(true);
    setError('');
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
        setError(json.error || 'Could not create that login.');
        return null;
      }
      const boat = vessels.find(v => v.id === qaVesselId);
      const member: MemberHit = {
        id: json.member?.id || '',
        user_id: json.member?.user_id || '',
        email: qaEmail.trim(),
        display_name: `${qaFirst.trim()} ${qaLast.trim()}`.trim(),
        role: qaRole,
        vessel_id: qaVesselId,
        vessel_name: boat?.name || '',
        company_name: boat?.company_name || '',
      };
      applyMember(member, qaPassword);
      await loadMembers(memberQuery);
      return member;
    } finally {
      setCreateBusy(false);
    }
  }

  const addresses = to.split(/[,\s;]+/).map(s => s.trim()).filter(Boolean);
  const valid = Array.from(new Set(addresses.filter(a => EMAIL_RE.test(a))));
  const invalid = addresses.filter(a => !EMAIL_RE.test(a));
  const tooMany = template === 'welcome' && valid.length > 1;
  const welcomeNeedsPassword = template === 'welcome' && vars.password.trim().length < MIN_PASSWORD_LENGTH;
  const welcomeNeedsPerson = template === 'welcome' && !picked && !creating;
  const canSend = valid.length > 0 && !invalid.length && !tooMany && !sending && !createBusy
    && !welcomeNeedsPassword && !welcomeNeedsPerson;

  async function send(mode: 'real' | 'test', opts?: { replacePassword?: boolean }) {
    setSending(mode); setOk(''); setError('');
    if (!opts?.replacePassword) setPwMismatch(false);
    try {
      let sendVars = vars;
      if (template === 'welcome' && mode === 'real') {
        if (creating && !picked) {
          const created = await createLogin();
          if (!created) return;
          sendVars = {
            firstName: qaFirst.trim().split(/\s+/)[0] || '',
            vesselName: vessels.find(v => v.id === qaVesselId)?.name || '',
            loginEmail: qaEmail.trim(),
            password: qaPassword,
          };
        } else if (picked?.vessel_id && picked.user_id && vars.password.trim()) {
          if (!opts?.replacePassword) {
            const check = await adminFetch(`/api/admin/vessels/${picked.vessel_id}/members`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: picked.user_id,
                password: vars.password.trim(),
                check_only: true,
              }),
            });
            const cj = await check.json().catch(() => ({}));
            if (!check.ok) {
              setError(cj.error || 'Could not check that password against their login.');
              return;
            }
            if (!cj.match) {
              setPwMismatch(true);
              return;
            }
          } else {
            const res = await adminFetch(`/api/admin/vessels/${picked.vessel_id}/members`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: picked.user_id, password: vars.password.trim() }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError(j.error || 'Could not save that password on their login.');
              return;
            }
            setPwMismatch(false);
          }
        }
      }
      const res = await adminFetch('/api/admin/customer-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template, to: valid, vars: sendVars, ...(mode === 'test' ? { test: true } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || 'Send failed.'); return; }
      if (j.test) {
        setOk(`Test sent to ${j.to}. Open it, then come back and send it for real.`);
      } else {
        setOk(j.bcc
          ? `Sent to ${j.sent} ${j.sent === 1 ? 'address' : 'addresses'}, BCC. Nobody can see who else got it.`
          : `Sent to ${valid.join(', ')}.${
              template === 'welcome' && creating && !picked
                ? ' Login is live.'
                : opts?.replacePassword
                  ? ' Their login now uses this password.'
                  : ''
            }`);
        if (template !== 'welcome') setTo('');
      }
    } finally {
      setSending('');
    }
  }

  const t = TEMPLATES[template];

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2.5">
        <Mail className="w-5 h-5 text-brand-navy" />
        <h1 className="font-display text-2xl font-bold text-brand-navy">Emails</h1>
      </div>
      <p className="text-sm text-gray-500 mt-1 mb-6 max-w-2xl">
        What you see on the right is exactly what lands in their inbox. Nothing sends until you press the button.
      </p>

      <div className="grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        {/* ── steps ── */}
        <div className="flex flex-col gap-6 min-w-0">

          <Step n={1} title="Which email?">
            <div className="grid grid-cols-2 gap-2.5">
              {(Object.keys(TEMPLATES) as TemplateKey[]).map(k => {
                const c = TEMPLATES[k];
                const on = template === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setTemplate(k);
                      setOk('');
                      setError('');
                      if (k !== 'welcome') {
                        setPicked(null);
                        setCreating(false);
                      }
                    }}
                    className={`rounded-xl border-2 p-3 text-left transition-colors ${
                      on
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-gray-200 bg-white hover:border-brand-gold'
                    }`}
                  >
                    <c.Icon className={`w-5 h-5 mb-1.5 ${on ? 'text-brand-yellow' : 'text-brand-gold'}`} />
                    <div className="text-sm font-bold leading-tight">{c.title}</div>
                    <div className={`text-[11px] font-semibold uppercase tracking-wide mt-0.5 ${on ? 'text-white/60' : 'text-gray-400'}`}>
                      {c.who}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[13px] text-gray-500 mt-2.5 leading-relaxed">{t.carries}</p>
          </Step>

          {template === 'welcome' && (
            <Step n={2} title="Who is it for?" hint="Pick a login that already exists, or create one here. The password you type is what they sign in with and what goes in the email.">
              {picked && !creating ? (
                <div className="rounded-xl border border-brand-navy/20 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-brand-navy text-sm truncate">{picked.display_name || picked.email}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {picked.vessel_name || 'No boat'}
                        {picked.company_name ? ` · ${picked.company_name}` : ''}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{picked.email}</p>
                    </div>
                    <button type="button" className="text-xs font-semibold text-brand-river hover:text-brand-navy shrink-0"
                      onClick={() => { setPicked(null); setPwMismatch(false); setVars({ firstName: '', vesselName: '', loginEmail: '', password: '' }); setTo(''); }}>
                      Change
                    </button>
                  </div>
                  <label className="block mt-3">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Password for the email</span>
                    <input
                      id="em-pass"
                      className="input-base mt-1"
                      placeholder={`Type it — min ${MIN_PASSWORD_LENGTH} characters`}
                      value={vars.password}
                      onChange={e => { setVars(v => ({ ...v, password: e.target.value })); setPwMismatch(false); }}
                      autoComplete="off"
                    />
                  </label>
                  {pwMismatch ? (
                    <div className="mt-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                      <p className="text-sm font-bold text-amber-950">That is not their current password.</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-amber-950/80">
                        Nothing has been changed. You can type the one they already use, or switch their login to what you typed and send that.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={!canSend}
                          onClick={() => send('real', { replacePassword: true })}
                          className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {sending === 'real' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          Change their password to this & send
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPwMismatch(false); setVars(v => ({ ...v, password: '' })); }}
                          className="text-xs font-semibold text-amber-950/60 hover:text-amber-950 px-2"
                        >
                          I&apos;ll type a different one
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      If this is already their password, the email just goes out. If it isn&apos;t, we&apos;ll stop and ask before changing their login.
                    </p>
                  )}
                </div>
              ) : creating ? (
                <div className="rounded-xl border border-brand-navy/20 bg-white p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-brand-navy">New login</p>
                    <button type="button" className="text-xs font-semibold text-brand-river hover:text-brand-navy"
                      onClick={() => { setCreating(false); setVars({ firstName: '', vesselName: '', loginEmail: '', password: '' }); setTo(''); }}>
                      Cancel
                    </button>
                  </div>
                  <select className="input-base" value={qaCompany}
                    onChange={e => { setQaCompany(e.target.value); setQaVesselId(''); fillCreatePreview({ vessel: '' }); }}>
                    <option value="">Company…</option>
                    {companies.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                  <select className="input-base" value={qaVesselId}
                    onChange={e => { setQaVesselId(e.target.value); fillCreatePreview({ vessel: e.target.value }); }}>
                    <option value="">Boat…</option>
                    {vesselOptions.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input className="input-base" placeholder="First name" value={qaFirst} autoComplete="off"
                      onChange={e => { setQaFirst(e.target.value); fillCreatePreview({ first: e.target.value }); }} />
                    <input className="input-base" placeholder="Last name" value={qaLast} autoComplete="off"
                      onChange={e => setQaLast(e.target.value)} />
                  </div>
                  <input className="input-base" placeholder="Their sign-in email" type="email" value={qaEmail} autoComplete="off"
                    onChange={e => { setQaEmail(e.target.value); fillCreatePreview({ email: e.target.value }); }} />
                  <input className="input-base" placeholder={`Password (min ${MIN_PASSWORD_LENGTH})`} value={qaPassword} autoComplete="off"
                    onChange={e => { setQaPassword(e.target.value); fillCreatePreview({ password: e.target.value }); }} />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Role</p>
                    <CrewRoleField value={qaRole} onChange={setQaRole} />
                  </div>
                  <Link href="/admin/customers/onboard" className="text-xs text-brand-river hover:underline inline-flex items-center gap-1">
                    <Ship className="w-3.5 h-3.5" /> Need a new boat? Open onboard →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="search"
                      className="input-base pl-9"
                      placeholder="Search name, email, boat…"
                      value={memberQuery}
                      onChange={e => setMemberQuery(e.target.value)}
                    />
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    {membersLoading && members.length === 0 ? (
                      <div className="py-8 grid place-items-center text-gray-300">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    ) : members.length === 0 ? (
                      <p className="px-3 py-6 text-sm text-gray-400 text-center">No logins match that.</p>
                    ) : (
                      <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                        {members.map(m => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => applyMember(m)}
                              className="w-full text-left px-3 py-2.5 hover:bg-brand-sand/40 transition-colors"
                            >
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="font-semibold text-sm text-brand-navy truncate">{m.display_name || m.email || 'Unnamed'}</span>
                                <span className="text-[11px] text-gray-400 shrink-0 truncate max-w-[45%]">{m.vessel_name}</span>
                              </span>
                              <span className="block text-xs text-gray-400 truncate">{m.email}{m.company_name ? ` · ${m.company_name}` : ''}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button type="button" onClick={startCreate}
                    className="w-full rounded-xl border border-dashed border-brand-navy/30 bg-brand-navy/[0.03] px-3 py-2.5 text-left text-sm text-brand-navy hover:border-brand-navy/60 hover:bg-brand-navy/[0.06] flex items-center gap-2">
                    <UserPlus className="w-4 h-4 shrink-0" />
                    <span>
                      <span className="font-semibold block leading-tight">Create a new login</span>
                      <span className="text-xs text-gray-400">Name, boat, email, password — then this email goes out</span>
                    </span>
                  </button>
                </div>
              )}
            </Step>
          )}

          <Step
            n={template === 'welcome' ? 3 : 2}
            title="Send it to"
            hint={template === 'welcome'
              ? 'One address. This email carries a password.'
              : 'One per line, or separated by commas. Everyone goes BCC.'}
          >
            <textarea
              id="em-to"
              className="input-base min-h-[96px] font-mono text-[13px]"
              placeholder={template === 'welcome' ? 'gregory@…' : 'captain@…\ndispatch@…'}
              value={to}
              onChange={e => { setTo(e.target.value); setOk(''); setError(''); }}
            />

            {(valid.length > 0 || invalid.length > 0) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {valid.map(a => (
                  <span key={a} className="inline-flex items-center gap-1 rounded-full bg-brand-sand/70 border border-brand-gold/30 px-2 py-0.5 text-[11px] text-brand-navy max-w-full">
                    <span className="truncate">{a}</span>
                  </span>
                ))}
                {invalid.map(a => (
                  <span key={a} className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[11px] text-red-700 max-w-full">
                    <X className="w-3 h-3 shrink-0" /><span className="truncate">{a}</span>
                  </span>
                ))}
              </div>
            )}
            {tooMany && (
              <p className="text-xs text-red-600 mt-2">
                One address at a time. Everyone on this email would get the same login.
              </p>
            )}
            {template === 'welcome' && welcomeNeedsPerson && (
              <p className="text-xs text-brand-navy/60 mt-2">Pick someone above, or create a new login.</p>
            )}
            {template === 'welcome' && !welcomeNeedsPerson && welcomeNeedsPassword && (
              <p className="text-xs text-brand-navy/60 mt-2">Type the password so the email matches their login.</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-3.5">
              <button type="button" disabled={!canSend || pwMismatch} onClick={() => send('real')}>
                className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-40">
                {sending === 'real' || createBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending === 'real' || createBusy
                  ? 'Sending…'
                  : template === 'welcome'
                    ? (creating && !picked ? 'Create login & send' : 'Send welcome email')
                    : `Send to ${valid.length || 0}`}
              </button>
              <button type="button" disabled={!!sending} onClick={() => send('test')}
                className="btn-outline text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
                {sending === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                Send me one first
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              The test goes to the GTS inbox so you can see it land in a real inbox.
            </p>
          </Step>

          {ok && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><span>{ok}</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>

        {/* ── preview ── */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Preview</p>
            <div className="flex rounded-lg bg-gray-100 p-0.5">
              {([['desktop', Monitor], ['phone', Smartphone]] as const).map(([k, I]) => (
                <button key={k} type="button" onClick={() => setWidth(k)}
                  title={k === 'phone' ? 'Phone width' : 'Desktop width'}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    width === k ? 'bg-white shadow-sm text-brand-navy' : 'text-gray-400 hover:text-brand-navy'
                  }`}>
                  <I className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
            <div className="flex items-baseline gap-2 px-4 py-3 border-b border-gray-200 bg-white min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0">Subject</span>
              <span className="text-sm font-semibold text-brand-navy break-words min-w-0">{subject || '…'}</span>
            </div>
            <div className="p-3 sm:p-4 flex justify-center">
              {loadingPreview && !html ? (
                <div className="h-[640px] w-full grid place-items-center bg-white rounded">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                </div>
              ) : (
                <iframe
                  title="Email preview"
                  srcDoc={html}
                  sandbox=""
                  style={{ width: width === 'phone' ? 390 : '100%', maxWidth: '100%' }}
                  className="h-[640px] bg-white rounded-lg border border-gray-200 shadow-sm"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
