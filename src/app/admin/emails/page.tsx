'use client';
// src/app/admin/emails/page.tsx
//
// The two emails Jen sends by hand. Pick one, see exactly what the customer
// will see, send it. Asked for on the Sep 21 call so she stops rebuilding the
// same Gmail draft and attaching Sinclair's 25 page spreadsheet.
import { useState, useEffect, useCallback } from 'react';
import { Mail, Send, Loader2, CheckCircle2, AlertTriangle, UserPlus, Megaphone } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';

type TemplateKey = 'welcome' | 'announcement';

const TEMPLATES: Record<TemplateKey, { title: string; who: string; Icon: typeof Mail }> = {
  welcome: {
    title: 'New customer',
    who: 'One person, right after you create their login. Carries their sign in and step-by-step instructions.',
    Icon: UserPlus,
  },
  announcement: {
    title: 'Announcement',
    who: 'Everybody. Sent BCC so nobody sees who else is on the list.',
    Icon: Megaphone,
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailsPage() {
  const [template, setTemplate] = useState<TemplateKey>('welcome');
  const [vars, setVars] = useState({ firstName: '', vesselName: '', loginEmail: '', password: '' });
  const [to, setTo] = useState('');
  const [html, setHtml] = useState('');
  const [subject, setSubject] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [sending, setSending] = useState(false);
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
  const valid = addresses.filter(a => EMAIL_RE.test(a));
  const invalid = addresses.filter(a => !EMAIL_RE.test(a));
  const tooMany = template === 'welcome' && valid.length > 1;
  const canSend = valid.length > 0 && !invalid.length && !tooMany && !sending;

  async function send() {
    setSending(true); setOk(''); setError('');
    try {
      const res = await adminFetch('/api/admin/customer-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, to: valid, vars }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || 'Send failed.'); return; }
      setOk(
        j.bcc
          ? `Sent to ${j.sent} ${j.sent === 1 ? 'address' : 'addresses'}, BCC. Nobody can see who else got it.`
          : `Sent to ${valid.join(', ')}.`,
      );
      setTo('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2.5 mb-1">
        <Mail className="w-5 h-5 text-brand-navy" />
        <h1 className="text-2xl font-bold text-brand-navy">Emails</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Pick an email, fill in the blanks, and check the preview before it goes. What you see on the right is exactly what lands in their inbox.
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* ── compose ── */}
        <div className="flex flex-col gap-4 min-w-0">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TEMPLATES) as TemplateKey[]).map(k => {
              const t = TEMPLATES[k];
              const on = template === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setTemplate(k); setOk(''); setError(''); }}
                  className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                    on ? 'border-brand-navy bg-brand-navy text-white' : 'border-gray-200 bg-white hover:border-brand-gold'
                  }`}
                >
                  <t.Icon className="w-4 h-4" />
                  <span className="text-sm font-bold">{t.title}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[13px] leading-relaxed text-gray-500 -mt-1">{TEMPLATES[template].who}</p>

          {template === 'welcome' && (
            <div className="card-base p-4 flex flex-col gap-3">
              <p className="label-base">Who is it for?</p>
              <input id="em-first" className="input-base" placeholder="First name — Gregory"
                value={vars.firstName} onChange={e => setVars(v => ({ ...v, firstName: e.target.value }))} />
              <input id="em-vessel" className="input-base" placeholder="Boat — Scott Noble"
                value={vars.vesselName} onChange={e => setVars(v => ({ ...v, vesselName: e.target.value }))} />
              <input id="em-login" className="input-base" placeholder="Their sign-in email"
                value={vars.loginEmail} onChange={e => setVars(v => ({ ...v, loginEmail: e.target.value }))} />
              <input id="em-pass" className="input-base" placeholder="The password you set on the Customers tab"
                value={vars.password} onChange={e => setVars(v => ({ ...v, password: e.target.value }))} />
              <p className="text-xs text-gray-400">
                This email shows the password in plain text so they can sign in without calling. Send it to them and nobody else.
              </p>
            </div>
          )}

          <div className="card-base p-4 flex flex-col gap-2">
            <label htmlFor="em-to" className="label-base">
              {template === 'welcome' ? 'Send to' : 'Send to (one per line, or separated by commas)'}
            </label>
            <textarea
              id="em-to"
              className="input-base min-h-[88px] font-mono text-[13px]"
              placeholder={template === 'welcome' ? 'gregory@…' : 'captain@…\ndispatch@…'}
              value={to}
              onChange={e => { setTo(e.target.value); setOk(''); setError(''); }}
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-gray-500">{valid.length} valid</span>
              {invalid.length > 0 && (
                <span className="text-red-600">Check these: {invalid.join(', ')}</span>
              )}
              {tooMany && (
                <span className="text-red-600">One address at a time — this one carries a password.</span>
              )}
            </div>

            <button type="button" disabled={!canSend} onClick={send}
              className="btn-primary mt-1 inline-flex items-center justify-center gap-2 disabled:opacity-40">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending…' : template === 'welcome' ? 'Send welcome email' : `Send to ${valid.length || 0}`}
            </button>
            <p className="text-xs text-gray-400">
              Send it to yourself first if you want to see how it arrives.
            </p>
          </div>

          {ok && (
            <div className="flex items-start gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><span>{ok}</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>

        {/* ── preview ── */}
        <div className="min-w-0">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-baseline gap-2 px-1 pb-3 min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 shrink-0">Subject</span>
              <span className="text-sm font-semibold text-brand-navy break-words min-w-0">{subject || '…'}</span>
            </div>
            {loadingPreview && !html ? (
              <div className="h-[560px] grid place-items-center bg-white rounded">
                <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
              </div>
            ) : (
              <iframe
                title="Email preview"
                srcDoc={html}
                className="w-full h-[560px] bg-white rounded border-0"
                sandbox=""
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
