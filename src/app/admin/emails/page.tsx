'use client';
// src/app/admin/emails/page.tsx
//
// The two emails Jen sends by hand. The announcement goes out from here; the
// welcome email carries a password, so it is sent from Customers → Logins,
// where the login is created. The preview on the right is built by the same
// function the send uses, so what she approves is what the customer gets.
//
// Asked for on the Sep 21 call, so she stops rebuilding the same Gmail draft
// and attaching Sinclair's 25 page spreadsheet.
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Mail, Send, Loader2, CheckCircle2, AlertTriangle, UserPlus, Megaphone,
  Monitor, Smartphone, X, FlaskConical, Copy, Check, ArrowRight,
} from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { boatInviteText } from '@/lib/boat-invite';
import { EmailQuota, addressesThatFit, announcementCost, quotaRoom } from '@/lib/email-quota';

type TemplateKey = 'welcome' | 'announcement';
/** Addresses per request, a multiple of the 49-address BCC group, so a big
 *  list shows progress and a failure part way keeps the rest in the box. */
const SEND_CHUNK = 490;

function ctTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }) + ' CT';
}
function ctDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });
}
function untilLabel(iso: string, now: number): string {
  const mins = Math.max(0, Math.ceil((Date.parse(iso) - now) / 60000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

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
  const [vars] = useState({ firstName: '', vesselName: '', loginEmail: '', password: '' });
  const [to, setTo] = useState('');
  const [html, setHtml] = useState('');
  const [subject, setSubject] = useState('');
  const [width, setWidth] = useState<'phone' | 'desktop'>('desktop');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [sending, setSending] = useState<'' | 'real' | 'test'>('');
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');

  const [copied, setCopied] = useState(false);
  const [quota, setQuota] = useState<EmailQuota | null>(null);
  const [quotaError, setQuotaError] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadQuota = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/email-quota');
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setQuota(j); setQuotaError(''); }
      else setQuotaError(j.error || 'Could not read the email quota from Resend.');
    } catch {
      setQuotaError('Could not read the email quota from Resend.');
    }
  }, []);

  useEffect(() => { loadQuota(); }, [loadQuota]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);
  // Past the daily reset, ask Resend again rather than show yesterday's count.
  useEffect(() => {
    if (quota?.resetsAt && now >= Date.parse(quota.resetsAt)) loadQuota();
  }, [now, quota, loadQuota]);

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

  const addresses = to.split(/[,\s;]+/).map(s => s.trim()).filter(Boolean);
  const valid = Array.from(new Set(addresses.filter(a => EMAIL_RE.test(a))));
  const invalid = addresses.filter(a => !EMAIL_RE.test(a));
  // What Resend says is left decides how many can go: each address counts,
  // plus the GTS copy on every 49-address BCC group.
  const cost = announcementCost(valid.length);
  const room = quota ? quotaRoom(quota) : null;
  const fit = room ? addressesThatFit(room.left) : null;
  const overQuota = !!room && cost > room.left;
  const canSend = valid.length > 0 && !invalid.length && !overQuota && !sending;

  async function send(mode: 'real' | 'test') {
    setSending(mode); setOk(''); setError('');
    try {
      if (mode === 'test') {
        const res = await adminFetch('/api/admin/customer-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template, to: valid, vars, test: true }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { setError(j.error || 'Send failed.'); return; }
        setOk(`Test sent to ${j.to}. Open it, then come back and send it for real.`);
        return;
      }

      const list = valid;
      let done = 0;
      setProgress({ done, total: list.length });
      for (let i = 0; i < list.length; i += SEND_CHUNK) {
        if (i > 0) await new Promise(r => window.setTimeout(r, 300));
        const part = list.slice(i, i + SEND_CHUNK);
        const res = await adminFetch('/api/admin/customer-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template, to: part, vars, bcc: true }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Keep only what didn't go out, so trying again can't double-send.
          const left = list.slice(i + (typeof j.sent === 'number' ? j.sent : 0));
          done += typeof j.sent === 'number' ? j.sent : 0;
          setTo(left.join('\n'));
          setError(`${done ? `Sent to ${done} of ${list.length}. ` : ''}${j.error || 'Send failed.'} The ${left.length} not sent are still in the box.`);
          return;
        }
        done += j.sent || part.length;
        setProgress({ done, total: list.length });
      }
      setOk(`Sent to ${done} ${done === 1 ? 'address' : 'addresses'}, BCC. Nobody can see who else got it.`);
      setTo('');
    } finally {
      setSending('');
      setProgress(null);
      loadQuota();
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

          {template === 'welcome' ? (
            <Step n={2} title="Send it from Customers → Logins"
              hint="This email carries their password, so it goes out where the login is made. Pick or create the company, boat and login there, then send it in one tap.">
              <Link href="/admin/customers?tab=logins"
                className="btn-primary inline-flex items-center justify-center gap-2 min-h-[44px]">
                <UserPlus className="w-4 h-4" /> Open Customers → Logins <ArrowRight className="w-4 h-4" />
              </Link>
            </Step>
          ) : (
          <Step
            n={2}
            title="Send it to"
            hint="One per line, or separated by commas. Everyone goes BCC."
          >
            <textarea
              id="em-to"
              className="input-base min-h-[96px] font-mono text-[13px]"
              placeholder={'captain@…\ndispatch@…'}
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
            {overQuota && room && fit != null && (
              <p className="text-sm text-red-600 mt-2">
                You can send to {fit} more {room.per}. Remove {valid.length - fit} or send the rest after{' '}
                {room.resetsAt ? (room.per === 'today' ? ctTime(room.resetsAt) : ctDate(room.resetsAt)) : 'the reset'}.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-3.5">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(boatInviteText({ vesselName: vars.vesselName }));
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2500);
                  } catch {
                    setError('Could not copy. Select the preview and copy it yourself.');
                  }
                }}
                className="btn-outline text-sm inline-flex items-center gap-1.5"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy text message'}
              </button>
              <button type="button" disabled={!canSend} onClick={() => send('real')}
                className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-40">
                {sending === 'real' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending === 'real'
                  ? (progress && progress.total > SEND_CHUNK ? `Sending ${progress.done} of ${progress.total}…` : 'Sending…')
                  : `Send to ${valid.length || 0}`}
              </button>
              <button type="button" disabled={!!sending} onClick={() => send('test')}
                className="btn-outline text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
                {sending === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                Send me one first
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-2.5">
              {quota ? (
                quota.dailyRemaining != null ? (
                  <>
                    <span className="font-semibold text-brand-navy">{quota.dailyRemaining.toLocaleString()} emails left today.</span>
                    {quota.resetsAt && <> Resets at {ctTime(quota.resetsAt)} (in {untilLabel(quota.resetsAt, now)}).</>}
                  </>
                ) : quota.monthlyRemaining != null ? (
                  <span className="font-semibold text-brand-navy">{quota.monthlyRemaining.toLocaleString()} emails left this month.</span>
                ) : (
                  <span className="font-semibold text-brand-navy">No email limit on this plan.</span>
                )
              ) : quotaError ? <span className="text-amber-700">{quotaError}</span> : 'Checking how many emails are left…'}
              {valid.length > 0 && <> This send uses {cost.toLocaleString()}.</>}
            </p>
            {quota && quota.monthlyLimit != null && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                {(quota.monthlyRemaining ?? 0).toLocaleString()} of {quota.monthlyLimit.toLocaleString()} left this month
                {quota.monthlyResetsAt ? `, resets ${ctDate(quota.monthlyResetsAt)}` : ''}.
              </p>
            )}
            <p className="text-xs text-gray-400 mt-2">
              The test goes to the GTS inbox so you can see it land in a real inbox.
            </p>
          </Step>
          )}

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
