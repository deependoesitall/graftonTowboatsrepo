'use client';
// src/app/admin/emails/page.tsx
//
// The two emails Jen sends by hand, laid out as three steps she works down:
// pick one, fill the blanks, send it. The preview on the right is built by the
// same function the send uses, so what she approves is what the customer gets.
//
// Asked for on the Sep 21 call, so she stops rebuilding the same Gmail draft
// and attaching Sinclair's 25 page spreadsheet.
import { useState, useEffect, useCallback } from 'react';
import {
  Mail, Send, Loader2, CheckCircle2, AlertTriangle, UserPlus, Megaphone,
  Monitor, Smartphone, X, FlaskConical,
} from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';

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
  const tooMany = template === 'welcome' && valid.length > 1;
  const canSend = valid.length > 0 && !invalid.length && !tooMany && !sending;

  async function send(mode: 'real' | 'test') {
    setSending(mode); setOk(''); setError('');
    try {
      const res = await adminFetch('/api/admin/customer-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template, to: valid, vars, ...(mode === 'test' ? { test: true } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || 'Send failed.'); return; }
      if (j.test) {
        setOk(`Test sent to ${j.to}. Open it, then come back and send it for real.`);
      } else {
        setOk(j.bcc
          ? `Sent to ${j.sent} ${j.sent === 1 ? 'address' : 'addresses'}, BCC. Nobody can see who else got it.`
          : `Sent to ${valid.join(', ')}.`);
        setTo('');
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
                    onClick={() => { setTemplate(k); setOk(''); setError(''); }}
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
            <Step n={2} title="Who is it for?" hint="These drop straight into the email.">
              <div className="flex flex-col gap-2.5">
                <input id="em-first" className="input-base" placeholder="First name — Gregory"
                  value={vars.firstName} onChange={e => setVars(v => ({ ...v, firstName: e.target.value }))} />
                <input id="em-vessel" className="input-base" placeholder="Boat — Scott Noble"
                  value={vars.vesselName} onChange={e => setVars(v => ({ ...v, vesselName: e.target.value }))} />
                <input id="em-login" className="input-base" placeholder="Their sign-in email"
                  value={vars.loginEmail} onChange={e => setVars(v => ({ ...v, loginEmail: e.target.value }))} />
                <input id="em-pass" className="input-base" placeholder="Password you set on the Customers tab"
                  value={vars.password} onChange={e => setVars(v => ({ ...v, password: e.target.value }))} />
              </div>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                Most of the time you will not need this screen. Set a password on the
                Customers tab and it offers to send this email with everything already filled in.
              </p>
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

            <div className="flex flex-wrap items-center gap-2 mt-3.5">
              <button type="button" disabled={!canSend} onClick={() => send('real')}
                className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-40">
                {sending === 'real' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending === 'real'
                  ? 'Sending…'
                  : template === 'welcome'
                    ? 'Send welcome email'
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
