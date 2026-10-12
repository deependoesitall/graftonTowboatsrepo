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
import {
  Mail, Send, Loader2, CheckCircle2, AlertTriangle, UserPlus, Megaphone,
  Monitor, Smartphone, X, FlaskConical, Copy, Check,
} from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { boatInviteText } from '@/lib/boat-invite';
import { EmailQuota, quotaRoom } from '@/lib/email-quota';
import { AnnouncementVersions, type AnnouncementPreview } from '@/components/admin/AnnouncementVersions';
import { NewCustomerSend } from '@/components/admin/NewCustomerSend';
import { EmailQueuePanel } from '@/components/admin/EmailQueuePanel';
import { NewslettersPanel } from '@/components/admin/NewslettersPanel';
import { ContactsPanel } from '@/components/admin/ContactsPanel';
import { parseEmailList } from '@/lib/email-address';

type TemplateKey = 'welcome' | 'announcement';

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
  const [tab, setTab] = useState<'send' | 'newsletters' | 'contacts'>('send');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'contacts' || t === 'newsletters') setTab(t);
  }, []);
  const [template, setTemplate] = useState<TemplateKey>('welcome');
  // Typed into the New customer form, so the preview shows the real boat.
  const [vars, setVars] = useState({ firstName: '', vesselName: '', loginEmail: '', password: '' });
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
  const [queueKey, setQueueKey] = useState(0);
  const [versionKey, setVersionKey] = useState('');
  const showAnnouncement = useCallback((p: AnnouncementPreview) => {
    setHtml(p.html); setSubject(p.subject); setLoadingPreview(false);
  }, []);
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
    if (template === 'announcement') return; // AnnouncementVersions drives this preview
    setLoadingPreview(true);
    const qs = new URLSearchParams(template === 'welcome' ? { template, ...vars } : { template });
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

  const { valid, invalid } = parseEmailList(to);
  // What Resend says is left decides how many go now: one email per
  // address. The rest are queued.
  const room = quota ? quotaRoom(quota) : null;
  const fit = room ? Math.max(0, room.left) : null;
  const overQuota = !!room && fit != null && valid.length > fit;
  const goNow = overQuota && fit != null ? fit : valid.length;
  const cost = goNow;
  const canSend = valid.length > 0 && !invalid.length && !sending;

  async function send(mode: 'real' | 'test') {
    setSending(mode); setOk(''); setError('');
    try {
      if (mode === 'test') {
        const res = await adminFetch('/api/admin/customer-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template, to: valid, vars: template === 'announcement' ? { version: versionKey } : vars, test: true }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { setError(j.error || 'Send failed.'); return; }
        setOk(`Test sent to ${j.to}. Open it, then come back and send it for real.`);
        return;
      }

      // The list goes into the queue: what today's quota allows goes out
      // now, the rest at the daily send time.
      const res = await adminFetch('/api/admin/email-imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: valid, sendNow: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || 'Send failed.'); return; }
      const parts = [`Sent to ${j.sentNow} now, one email each.`];
      if (j.queued > 0) parts.push(`${j.queued} queued for the daily send.`);
      if (j.skipped > 0) parts.push(`${j.skipped} skipped (already have an account or already got it).`);
      if (j.note) parts.push(j.note);
      setOk(parts.join(' '));
      setTo('');
      setQueueKey(k => k + 1);
    } finally {
      setSending('');
      loadQuota();
    }
  }

  const t = TEMPLATES[template];

  const quotaNote = (extra?: React.ReactNode) => (
    <>
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
        {extra}
      </p>
      {quota && quota.monthlyLimit != null && (
        <p className="text-[11px] text-gray-400 mt-0.5">
          {(quota.monthlyRemaining ?? 0).toLocaleString()} of {quota.monthlyLimit.toLocaleString()} left this month
          {quota.monthlyResetsAt ? `, resets ${ctDate(quota.monthlyResetsAt)}` : ''}.
        </p>
      )}
    </>
  );

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2.5">
        <Mail className="w-5 h-5 text-brand-navy" />
        <h1 className="font-display text-2xl font-bold text-brand-navy">Emails</h1>
      </div>
      <p className="text-sm text-gray-500 mt-1 mb-6 max-w-2xl">
        What you see in the preview is exactly what lands in their inbox. Nothing sends until you press the button.
      </p>
      <div className="flex gap-1 border-b border-gray-200 mb-6 -mt-2 overflow-x-auto">
        {([['send', 'Send'], ['newsletters', 'Newsletters'], ['contacts', 'Email list']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${
              tab === k ? 'border-brand-navy text-brand-navy' : 'border-transparent text-gray-500 hover:text-brand-navy'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'newsletters' && <NewslettersPanel />}
      {tab === 'contacts' && <ContactsPanel />}

      {tab === 'send' && (
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
            <Step n={2} title="Their boat and login"
              hint="Pick a company or boat that's already set up, or type a new one. Create & send makes the login and emails it.">
              <NewCustomerSend
                onVars={setVars}
                onSent={loadQuota}
                outOfEmails={!!room && room.left < 1}
                quotaNote={quotaNote(<> Each send uses 1.</>)}
              />
            </Step>
          ) : (
          <>
          <Step n={2} title="Which version?" hint="Tap one to preview it.">
            <AnnouncementVersions onPreview={showAnnouncement} onShowing={setVersionKey} />
          </Step>
          <Step
            n={3}
            title="Send it to"
            hint="One per line, or separated by commas. Each address gets its own email."
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
              <p className="text-sm text-brand-navy mt-2">
                {fit} can go {room.per === 'today' ? 'today' : 'this month'}. The other {valid.length - fit} wait in the queue
                and go out at the daily send time, as many as Resend allows each day.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-3.5">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(boatInviteText());
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
                {sending === 'real' ? 'Sending…' : `Send to ${valid.length || 0}`}
              </button>
              <button type="button" disabled={!!sending || (template === 'announcement' && !versionKey)} onClick={() => send('test')}
                className="btn-outline text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
                {sending === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                Send me one first
              </button>
            </div>
            {quotaNote(valid.length > 0 && <> Sending now uses {cost.toLocaleString()}.</>)}
            <p className="text-xs text-gray-400 mt-2">
              The test goes to the GTS inbox so you can see it land in a real inbox.
            </p>
            <div className="mt-5">
              <EmailQueuePanel reloadKey={queueKey} />
            </div>
          </Step>
          </>
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
      )}
    </div>
  );
}
