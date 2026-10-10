'use client';
// src/components/admin/OnboardSendCard.tsx
// Shown right after a crew password is set: send the welcome email, or copy /
// open it yourself. The password only exists here until the card is closed.
import { useState } from 'react';
import { Check, Copy, FlaskConical, Link2, Loader2, Mail, Send, X } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { boatSignInText, ORDER_SITE_URL } from '@/lib/boat-invite';

export type OnboardCardData = { name: string; email: string; vessel: string; password: string };

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function OnboardSendCard({ data, onClose }: { data: OnboardCardData; onClose: () => void }) {
  const first = data.name.trim().split(/\s+/)[0] || '';
  const [sending, setSending] = useState<'' | 'real' | 'test'>('');
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'' | 'message' | 'link'>('');
  const message = boatSignInText({ vesselName: data.vessel, email: data.email, password: data.password });
  const mailto = `mailto:${data.email}?subject=${encodeURIComponent('Your Grafton Towboat Services login')}&body=${encodeURIComponent(message)}`;

  async function send(test: boolean) {
    setSending(test ? 'test' : 'real');
    setError('');
    try {
      const res = await adminFetch('/api/admin/customer-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: 'welcome',
          to: [data.email],
          vars: { firstName: first, vesselName: data.vessel, loginEmail: data.email, password: data.password },
          ...(test ? { test: true } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || 'Could not send the welcome email.'); return; }
      setSent(test ? `Test sent to ${j.to || 'the GTS inbox'}.` : `Welcome email sent to ${data.email}.`);
    } finally {
      setSending('');
    }
  }

  async function copy(kind: 'message' | 'link', text: string) {
    if (await copyText(text)) {
      setCopied(kind);
      window.setTimeout(() => setCopied(''), 2000);
    } else {
      setError('Could not copy. Select the text and copy it yourself.');
    }
  }

  const small = 'btn-outline min-h-[44px] px-2 text-xs inline-flex flex-col sm:flex-row items-center justify-center gap-1';

  return (
    <div className="rounded-2xl border border-brand-gold/40 bg-brand-yellow/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-brand-navy">Send {first || 'them'} their login</p>
          <p className="text-xs text-brand-navy/60 mt-0.5">The password can&apos;t be shown again once you close this.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close"
          className="p-2 -m-2 text-brand-navy/40 hover:text-brand-navy">
          <X className="w-4 h-4" />
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-xl border border-brand-gold/30 bg-white px-3 py-2.5 text-sm">
        <dt className="text-gray-400">Link</dt>
        <dd className="font-medium text-brand-navy truncate">{ORDER_SITE_URL.replace(/^https?:\/\//, '')}</dd>
        {data.vessel && (
          <>
            <dt className="text-gray-400">Boat</dt>
            <dd className="font-medium text-brand-navy truncate">{data.vessel}</dd>
          </>
        )}
        <dt className="text-gray-400">Username</dt>
        <dd className="font-medium text-brand-navy break-all">{data.email || '—'}</dd>
        <dt className="text-gray-400">Password</dt>
        <dd className="font-mono font-semibold text-brand-navy break-all">{data.password}</dd>
      </dl>

      {sent && (
        <p className="mt-3 text-sm text-emerald-700 flex items-center gap-1.5">
          <Check className="w-4 h-4 shrink-0" /> {sent}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button type="button" onClick={() => send(false)} disabled={!data.email || !!sending}
        className="btn-primary mt-3 w-full min-h-[44px] inline-flex items-center justify-center gap-2 disabled:opacity-50">
        {sending === 'real' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {sending === 'real' ? 'Sending…' : 'Send welcome email'}
      </button>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => copy('message', message)} className={small}>
          {copied === 'message' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied === 'message' ? 'Copied' : 'Copy message'}
        </button>
        <a href={data.email ? mailto : undefined} aria-disabled={!data.email}
          className={`${small} ${data.email ? '' : 'pointer-events-none opacity-50'}`}>
          <Mail className="w-4 h-4" /> Open email
        </a>
        <button type="button" onClick={() => copy('link', ORDER_SITE_URL)} className={small}>
          {copied === 'link' ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <button type="button" onClick={() => send(true)} disabled={!data.email || !!sending}
        className="mt-2.5 text-xs font-semibold text-brand-navy/60 hover:text-brand-navy inline-flex items-center gap-1.5 disabled:opacity-50">
        {sending === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
        Send me one first
      </button>
    </div>
  );
}
