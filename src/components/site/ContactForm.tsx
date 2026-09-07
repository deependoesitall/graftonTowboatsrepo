'use client';
// src/components/site/ContactForm.tsx
//
// The one piece of real functionality Squarespace was providing.
//
// DESIGN NOTES:
//  · Every message is STORED as well as emailed. Squarespace kept a copy of
//    form submissions; if this only emailed, a Resend outage or a spam filter
//    would lose an enquiry silently and nobody would ever know it existed.
//    Storage is the source of truth, email is the notification.
//  · Success and failure are shown in place. No browser alerts, ever.
//  · A honeypot field handles bots instead of a CAPTCHA. A captain filling this
//    in on a phone, on a boat, with bad signal should not also have to identify
//    fire hydrants — and at this volume a hidden field stops essentially all of
//    the automated traffic that would otherwise arrive.

import { useState } from 'react';
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function ContactForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', email: '', phone: '', vessel: '', message: '',
    // Honeypot. Real people never see it, so anything that fills it is a bot.
    website: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.name.trim() || !form.message.trim()) {
      setError('Please add your name and a message.');
      return;
    }
    // We need SOME way to reply. Either is fine — crews often prefer a call.
    if (!form.email.trim() && !form.phone.trim()) {
      setError('Please add an email address or a phone number so we can reply.');
      return;
    }

    setStatus('sending');
    try {
      const res = await fetch('/api/site-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const msg = await res.json().then(j => j.error).catch(() => null);
        setError(msg || 'Something went wrong sending that. Please call us instead — (618) 556-0290.');
        setStatus('error');
        return;
      }
      setStatus('sent');
    } catch {
      setError('Could not reach the server. Please call us — (618) 556-0290.');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-brand-green/10 p-8 text-center">
        <CheckCircle2 className="w-11 h-11 text-brand-glight mx-auto mb-4" />
        <h3 className="gts-heading text-2xl mb-2">Message Received</h3>
        <p className="text-brand-green/70 font-body">
          We&apos;ll get back to you shortly. If it&apos;s urgent, call{' '}
          <a href="tel:6185560290" className="text-brand-orange font-semibold hover:underline">
            (618) 556-0290
          </a>{' '}
          — we answer around the clock.
        </p>
      </div>
    );
  }

  const field =
    'w-full rounded-xl border border-brand-green/20 bg-white/80 px-4 py-3 font-body text-brand-green ' +
    'placeholder:text-brand-green/35 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green/40';

  return (
    <form onSubmit={submit}
      className="bg-white/65 backdrop-blur-sm rounded-2xl border border-brand-green/10 p-6 md:p-8 space-y-4">

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="cf-name" className="block text-[11px] font-bold uppercase tracking-widest text-brand-green/60 mb-1.5">
            Name <span className="text-brand-orange">*</span>
          </label>
          <input id="cf-name" className={field} value={form.name} onChange={set('name')}
            autoComplete="name" required />
        </div>
        <div>
          <label htmlFor="cf-vessel" className="block text-[11px] font-bold uppercase tracking-widest text-brand-green/60 mb-1.5">
            Vessel or Company
          </label>
          <input id="cf-vessel" className={field} value={form.vessel} onChange={set('vessel')}
            placeholder="Optional" />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="cf-email" className="block text-[11px] font-bold uppercase tracking-widest text-brand-green/60 mb-1.5">
            Email
          </label>
          <input id="cf-email" type="email" className={field} value={form.email} onChange={set('email')}
            autoComplete="email" inputMode="email" />
        </div>
        <div>
          <label htmlFor="cf-phone" className="block text-[11px] font-bold uppercase tracking-widest text-brand-green/60 mb-1.5">
            Phone
          </label>
          <input id="cf-phone" type="tel" className={field} value={form.phone} onChange={set('phone')}
            autoComplete="tel" inputMode="tel" />
        </div>
      </div>
      <p className="text-[11px] text-brand-green/45 font-body -mt-1">
        Either one is fine — whichever you&apos;d rather we use.
      </p>

      <div>
        <label htmlFor="cf-message" className="block text-[11px] font-bold uppercase tracking-widest text-brand-green/60 mb-1.5">
          How can we help? <span className="text-brand-orange">*</span>
        </label>
        <textarea id="cf-message" rows={5} className={field} value={form.message}
          onChange={set('message')}
          placeholder="What you need, and roughly when you'll be through Grafton." required />
      </div>

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div className="absolute left-[-9999px]" aria-hidden="true">
        <label htmlFor="cf-website">Website</label>
        <input id="cf-website" tabIndex={-1} autoComplete="off"
          value={form.website} onChange={set('website')} />
      </div>

      {error && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 font-body">{error}</p>
        </div>
      )}

      <button type="submit" disabled={status === 'sending'}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-brand-green text-white font-bold uppercase tracking-widest text-sm px-8 py-4 rounded-full hover:bg-brand-gmed transition-colors disabled:opacity-60 shadow-lg">
        {status === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {status === 'sending' ? 'Sending…' : 'Send Message'}
      </button>

      <p className="text-[11px] text-brand-green/45 font-body">
        By sending this you agree to our{' '}
        <a href="/terms" className="underline hover:text-brand-green/70">Terms of Service</a> and{' '}
        <a href="/privacy" className="underline hover:text-brand-green/70">Privacy Policy</a>.
      </p>
    </form>
  );
}
