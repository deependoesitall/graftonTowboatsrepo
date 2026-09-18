'use client';
// src/components/auth/SaveOrderPrompt.tsx
//
// Guest → account victory lap. One screen, celebratory, prefilled from the order.
// Google + email. Order is already placed — never held hostage.

import { useEffect, useState } from 'react';
import { X, History, Zap, Ship, ShieldCheck, PartyPopper, Loader2 } from 'lucide-react';
import type { Order } from '@/types';
import { countableUnits } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { saveVesselInfo, getVesselInfo } from '@/lib/cart';

const dismissKey = (orderId: string) => `gts-save-order-dismissed:${orderId}`;
const APPEAR_AFTER_MS = 900;

export function SaveOrderPrompt({ order, orderNumber, onCreateAccount }: {
  order: Order | null;
  orderNumber: string | null;
  onCreateAccount: (email: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const orderId = order?.id || '';
  const email = (order?.vessel_email || order?.customer_email || '').trim();
  const company = (order?.company_name || '').trim();
  const vessel = (order?.vessel_name || '').trim();
  const contact = (order?.contact_name || '').trim();
  const phone = (order?.phone || '').trim();

  useEffect(() => {
    if (!orderId || !email) return;
    let dismissed = false;
    try { dismissed = !!localStorage.getItem(dismissKey(orderId)); } catch { /* private window */ }
    if (dismissed) return;

    // Seed vessel_info so Profile merge / checkout autofill already have the win.
    try {
      const cur = getVesselInfo();
      saveVesselInfo({
        ...cur,
        company_name: company || cur.company_name,
        vessel_name: vessel || cur.vessel_name,
        contact_name: contact || cur.contact_name,
        phone: phone || cur.phone,
        email: email || cur.email,
        vessel_email: (order?.vessel_email || '').trim() || cur.vessel_email,
      });
    } catch { /* fine */ }

    const t = setTimeout(() => setOpen(true), APPEAR_AFTER_MS);
    return () => clearTimeout(t);
  }, [orderId, email, company, vessel, contact, phone, order?.vessel_email]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setLeaving(true);
    try { localStorage.setItem(dismissKey(orderId), '1'); } catch { /* fine */ }
    setTimeout(() => { setOpen(false); setLeaving(false); }, 140);
  }

  async function continueWithGoogle() {
    setGoogleBusy(true);
    try {
      try { localStorage.setItem(dismissKey(orderId), '1'); } catch { /* fine */ }
      // Stash so account can celebrate the claim after OAuth lands.
      try {
        sessionStorage.setItem('gts_guest_victory', JSON.stringify({
          orderId,
          orderNumber,
          company,
          vessel,
          contact,
          email,
        }));
      } catch { /* fine */ }
      const next = orderId
        ? `/confirm?order=${encodeURIComponent(orderId)}${orderNumber ? `&num=${encodeURIComponent(orderNumber)}` : ''}`
        : '/account';
      const supabase = createClient();
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
    } catch {
      setGoogleBusy(false);
    }
  }

  if (!open) return null;

  const itemCount = (order?.items || [])
    .filter(i => i.item_type !== 'service')
    .reduce((s, i) => s + countableUnits(i), 0);

  const filledBits = [
    company && vessel ? `${company} · ${vessel}` : company || vessel,
    contact,
    email,
  ].filter(Boolean);

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="save-order-title"
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4
                  transition-opacity duration-150 ${leaving ? 'opacity-0' : 'opacity-100'}`}>
      <button
        aria-label="Close" onClick={close}
        className="absolute inset-0 bg-brand-navy/50 backdrop-blur-[2px]" />

      <div className={`relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl
                       overflow-hidden transition-transform duration-150
                       ${leaving ? 'translate-y-2' : 'translate-y-0'}`}>

        <button onClick={close} aria-label="Not now"
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center
                           text-white/70 hover:text-white hover:bg-white/10">
          <X className="w-4 h-4" />
        </button>

        <div className="bg-brand-navy px-6 pt-6 pb-5 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-gold mb-2 flex items-center gap-1.5">
            <PartyPopper className="w-3.5 h-3.5" />
            Order {orderNumber || ''} is placed
          </p>
          <h2 id="save-order-title" className="font-display text-2xl font-bold leading-tight">
            Save this order to an account
          </h2>
          <p className="text-white/70 text-sm mt-2 leading-relaxed">
            {vessel
              ? <>{vessel}&rsquo;s details and {itemCount} item{itemCount === 1 ? '' : 's'} are ready — keep them for next trip.</>
              : <>Your boat details and {itemCount} item{itemCount === 1 ? '' : 's'} are ready — keep them for next trip.</>}
          </p>
        </div>

        <div className="px-6 py-5">
          {filledBits.length > 0 && (
            <div className="mb-4 rounded-xl border border-brand-green/15 bg-brand-sand/50 px-3.5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-brand-green/50 mb-1.5">
                Already filled in
              </p>
              <ul className="space-y-1">
                {(company || vessel) && (
                  <li className="text-sm font-semibold text-brand-navy flex items-center gap-2">
                    <Ship className="w-3.5 h-3.5 text-brand-orange shrink-0" />
                    {[company, vessel].filter(Boolean).join(' · ')}
                  </li>
                )}
                {contact && (
                  <li className="text-sm text-brand-navy/80 pl-5.5" style={{ paddingLeft: '1.375rem' }}>
                    {contact}{phone ? ` · ${phone}` : ''}
                  </li>
                )}
                {email && (
                  <li className="text-sm text-brand-navy/80 break-all" style={{ paddingLeft: '1.375rem' }}>
                    {email}
                  </li>
                )}
              </ul>
            </div>
          )}

          <ul className="flex flex-col gap-3 mb-4">
            <Benefit
              icon={Zap}
              title="Reorder in one tap"
              body="This list becomes your next order."
            />
            <Benefit
              icon={History}
              title="Track what happens next"
              body="Received → Shopping → On the way → Done."
            />
          </ul>

          <div className="rounded-lg bg-brand-sand/60 px-3 py-2.5 flex items-start gap-2 mb-4">
            <ShieldCheck className="w-4 h-4 text-brand-green mt-0.5 shrink-0" />
            <p className="text-xs text-brand-green/80 leading-relaxed">
              Free, no card, and this order is already on its way either way.
              We&rsquo;ll use <b className="font-semibold break-all">{email}</b>.
            </p>
          </div>

          <button
            type="button"
            disabled={googleBusy}
            onClick={() => { void continueWithGoogle(); }}
            className="w-full flex items-center justify-center gap-2 border-2 border-brand-green/20 bg-white
                       text-brand-navy font-bold text-sm px-4 py-3.5 rounded-full hover:border-brand-green/40
                       hover:bg-brand-sand/40 transition-colors disabled:opacity-60"
          >
            {googleBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleMark />}
            Continue with Google
          </button>

          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem('gts_guest_victory', JSON.stringify({
                  orderId, orderNumber, company, vessel, contact, email,
                }));
              } catch { /* fine */ }
              close();
              onCreateAccount(email);
            }}
            className="mt-2.5 w-full bg-brand-orange text-white font-bold uppercase tracking-wide text-sm
                       px-4 py-3.5 rounded-full hover:bg-brand-ored transition-colors">
            Create with email
          </button>

          <button
            onClick={close}
            className="mt-2 w-full text-center text-sm text-brand-navy/50 hover:text-brand-navy/80 py-2">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function Benefit({ icon: Icon, title, body }: {
  icon: typeof Zap; title: string; body: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-9 h-9 rounded-full bg-brand-orange/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-brand-orange" />
      </span>
      <span className="min-w-0">
        <span className="block font-bold text-brand-navy text-sm leading-snug">{title}</span>
        <span className="block text-brand-navy/55 text-[13px] leading-relaxed mt-0.5">{body}</span>
      </span>
    </li>
  );
}

function GoogleMark() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z" />
      <path fill="#34A853" d="M5.3 14.3l-.8.6-2.4 1.9C3.7 20.1 7.5 22.5 12 22.5c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 1-3.6 1-2.8 0-5.1-1.9-6-4.4z" />
      <path fill="#4A90E2" d="M3.1 7.2C2.4 8.6 2 10.2 2 12s.4 3.4 1.1 4.8l3.2-2.5C5.8 13.5 5.5 12.8 5.5 12s.3-1.5.8-2.3L3.1 7.2z" />
      <path fill="#FBBC05" d="M12 5.5c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.5 14.7 1.5 12 1.5 7.5 1.5 3.7 3.9 2.1 7.2l3.2 2.5C6.9 7.4 9.2 5.5 12 5.5z" />
    </svg>
  );
}
