'use client';
// Phone-call onboarding: copy a text, or type an email and send. Jen asked
// for this on the Oct 5 call — boats call out of the blue and staff need
// something to paste in 10 seconds.
import { useState } from 'react';
import Link from 'next/link';
import { Copy, Check, Mail, Loader2, Ship, Send } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { boatInviteText } from '@/lib/boat-invite';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteCustomerPanel({ onClose }: { onClose: () => void }) {
  const [text] = useState(() => boatInviteText());
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');

  async function copy() {
    setError('');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not copy. Select the text and copy it yourself.');
    }
  }

  async function sendEmail() {
    const to = email.trim();
    if (!EMAIL_RE.test(to)) {
      setError('Type one email address.');
      return;
    }
    setSending(true);
    setOk('');
    setError('');
    try {
      const res = await adminFetch('/api/admin/customer-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: 'announcement', to: [to] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || 'Send failed.');
        return;
      }
      setOk(`Sent to ${to}.`);
      setEmail('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-brand-gold/40 bg-brand-sand/30 p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-brand-navy text-lg">Add customer</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            On the phone? Copy this and text it. Or type an email and send.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-gray-400 hover:text-brand-navy">
          Close
        </button>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Text message</p>
        <textarea
          readOnly
          value={text}
          rows={8}
          className="input-base font-mono text-[13px] leading-relaxed bg-white"
        />
        <button type="button" onClick={copy}
          className="btn-primary text-sm mt-2 inline-flex items-center gap-1.5">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy message'}
        </button>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Email them</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="cook@…"
            value={email}
            onChange={e => { setEmail(e.target.value); setOk(''); setError(''); }}
            className="input-base flex-1"
          />
          <button type="button" onClick={sendEmail} disabled={sending || !email.trim()}
            className="btn-outline text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-40">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1">
          <Mail className="w-3 h-3" />
          Sends the announcement — they create their own account from the link.
        </p>
      </div>

      <p className="text-sm text-brand-navy/80">
        Need to create their login and set a password?{' '}
        <Link href="/admin/customers/onboard" className="font-semibold text-brand-river hover:underline inline-flex items-center gap-1">
          <Ship className="w-3.5 h-3.5" /> Open add boat
        </Link>
      </p>

      {ok && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{ok}</p>}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
    </div>
  );
}
