'use client';
// src/components/auth/SaveOrderPrompt.tsx
//
// THE ONE MOMENT WORTH INTERRUPTING.
//
// A captain who has just submitted an order is the only person on this site who
// has already done all the work an account would have saved him. He typed his
// boat's name, his terminal, his captain's phone, and picked his items one at a
// time. Thirty seconds later he is gone, and the next trip he does all of it
// again from a blank page.
//
// Every other place to ask — a banner on the catalogue, a card in the footer —
// asks someone to imagine a benefit. This asks nothing: it names the work he
// just finished and offers to make it the last time he does it.
//
// ── RULES THIS FOLLOWS, BECAUSE INTERRUPTING HAS TO BE EARNED ────────────
//
// 1. THE ORDER IS NEVER HELD HOSTAGE. It is already placed, already emailed,
//    already on Sinclair's phones. The modal says so. An upsell that makes a
//    working man wonder whether his food is actually coming is worth less than
//    nothing, on a river where his alternative is phoning Jen like he always has.
//
// 2. IT WAITS FOR THE CONFIRMATION TO LAND. The order number is what he came to
//    this page for; covering it the instant it renders reads as a pop-up ad and
//    trains people to dismiss without reading. A short beat first.
//
// 3. IT ASKS ONCE, PER ORDER. Dismissal is remembered. A refresh, a back
//    button, or opening the confirmation link again from his email does not
//    re-ask. The card lower down the page stays for anyone who changes his mind.
//
// 4. IT NEVER APPEARS FOR SOMEONE ALREADY SIGNED IN.

import { useEffect, useState } from 'react';
import { X, History, Zap, Ship, ShieldCheck } from 'lucide-react';
import type { Order } from '@/types';

/** Remembered per order, so re-opening the emailed link doesn't re-ask. */
const dismissKey = (orderId: string) => `gts-save-order-dismissed:${orderId}`;

/**
 * Long enough for the green tick and the order number to register as "done",
 * short enough to still belong to the same moment. Under half a second this
 * reads as a pop-up that was waiting to fire; over about two, attention has
 * already moved to the items list.
 */
const APPEAR_AFTER_MS = 900;

export function SaveOrderPrompt({ order, orderNumber, onCreateAccount }: {
  order: Order | null;
  orderNumber: string | null;
  onCreateAccount: (email: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const orderId = order?.id || '';
  // The address the confirmation was just sent to. Using it means the account
  // is created against an address he has already proved he reads, and the
  // claim-orders step then finds this very order waiting for him.
  // `customer_email` is the billing address on Order; there is no bare
  // `email` field. The vessel's own address wins because that is where the
  // confirmation just went, and matching it is what lets claim-orders pull
  // this order into the new account.
  const email = (order?.vessel_email || order?.customer_email || '').trim();

  useEffect(() => {
    if (!orderId || !email) return;
    let dismissed = false;
    try { dismissed = !!localStorage.getItem(dismissKey(orderId)); } catch { /* private window */ }
    if (dismissed) return;

    const t = setTimeout(() => setOpen(true), APPEAR_AFTER_MS);
    return () => clearTimeout(t);
  }, [orderId, email]);

  // Escape closes, and the background stops scrolling underneath — a modal you
  // can scroll behind feels broken on a phone.
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

  if (!open) return null;

  // Real numbers from his real order. "Reorder these 23 items" is an offer;
  // "reorder your items" is a slogan.
  const itemCount = (order?.items || [])
    .filter(i => i.item_type !== 'service')
    .reduce((s, i) => s + (i.quantity || 0), 0);
  const vessel = (order?.vessel_name || '').trim();

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

        {/* Reassurance FIRST, in the header, before a single word of pitch. */}
        <div className="bg-brand-navy px-6 pt-6 pb-5 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-gold mb-2">
            Order {orderNumber || ''} is placed
          </p>
          <h2 id="save-order-title" className="font-display text-2xl font-bold leading-tight">
            Next time, this takes<br />ten seconds.
          </h2>
          <p className="text-white/70 text-sm mt-2 leading-relaxed">
            {vessel
              ? <>You just filled in {vessel}&rsquo;s details and picked {itemCount} item{itemCount === 1 ? '' : 's'}. An account remembers both.</>
              : <>You just filled in your boat&rsquo;s details and picked {itemCount} item{itemCount === 1 ? '' : 's'}. An account remembers both.</>}
          </p>
        </div>

        <div className="px-6 py-5">
          <ul className="flex flex-col gap-4">
            <Benefit
              icon={Zap}
              title="Reorder in one tap"
              body="Your last order becomes your next one. Change the quantities, send it."
            />
            <Benefit
              icon={Ship}
              title="Your boat, already filled in"
              body="Terminal, captain, phone, boat or van — typed once, never again."
            />
            <Benefit
              icon={History}
              title="Every order, kept"
              body="What you ordered last trip and what it cost, without digging through email."
            />
          </ul>

          <div className="mt-5 rounded-lg bg-brand-sand/60 px-3 py-2.5 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-green mt-0.5 shrink-0" />
            <p className="text-xs text-brand-green/80 leading-relaxed">
              {/* Naming the address matters: it removes the "what do they want
                  from me" question before it forms, and it is the same address
                  the confirmation just landed in. */}
              We&rsquo;ll use <b className="font-semibold break-all">{email}</b> — the address your
              confirmation just went to. Pick a password and you&rsquo;re done.
            </p>
          </div>

          <button
            onClick={() => { close(); onCreateAccount(email); }}
            className="mt-4 w-full bg-brand-orange text-white font-bold uppercase tracking-wide text-sm
                       px-4 py-3.5 rounded-full hover:bg-brand-ored transition-colors">
            Create my free account
          </button>

          <button
            onClick={close}
            className="mt-2 w-full text-center text-sm text-brand-navy/50 hover:text-brand-navy/80 py-2">
            Not now
          </button>

          {/* The whole promise, in one line, at the moment of decision. */}
          <p className="text-[11px] text-brand-navy/40 text-center mt-1 leading-relaxed">
            Free, no card, and this order is already on its way either way.
          </p>
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
