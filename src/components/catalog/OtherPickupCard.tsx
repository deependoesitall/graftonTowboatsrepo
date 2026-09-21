'use client';
// src/components/catalog/OtherPickupCard.tsx
//
// "Other" third-party item request — lives at the bottom of the Sinclair's
// groceries tab because Sinclair's (not Grafton) handles these pickups. The
// category sidebar links here via the #other-pickup anchor.
//
// The cart-backed wrapper around OtherPickupFields. Same reasoning as
// AdditionalServicesTab: the questions are shared with the admin order builder
// and are defined once, in components/order/ServiceFields. This file owns the
// framing copy and the fact that, here, the answers live in the cart.

import { useState, useEffect } from 'react';
import { Check, X, ShoppingBag } from 'lucide-react';
import { AdditionalServices } from '@/types';
import { getAdditionalServices, saveAdditionalServices } from '@/lib/cart';
import { OtherPickupFields, EMPTY_OTHER_ENTRY } from '@/components/order/ServiceFields';

export function OtherPickupCard() {
  const [services, setServices] = useState<AdditionalServices>(getAdditionalServices());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setServices(getAdditionalServices()); setHydrated(true); }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveAdditionalServices(services);
    window.dispatchEvent(new Event('cart-updated'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  const other = services.other_pickup ?? { enabled: false, items: [{ ...EMPTY_OTHER_ENTRY }] };

  return (
    <div id="other-pickup"
      className={`card-base overflow-hidden mt-8 scroll-mt-24 ${other.enabled ? 'ring-2 ring-brand-green/40' : ''}`}>
      <div className="flex items-center gap-4 p-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          other.enabled ? 'bg-brand-green text-white' : 'bg-gray-100 text-gray-400'
        }`}>
          {other.enabled ? <Check className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-display font-bold text-sm ${other.enabled ? 'text-brand-green' : 'text-brand-navy'}`}>
            Didn&apos;t find what you were looking for? No problem — we&apos;ll get it.
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Paste links to items from other stores (Walmart, anywhere) and they&apos;ll come with your
            groceries. Add as many as you need. These are <strong>COD</strong> — we can&apos;t know the
            price until it&apos;s bought, so they aren&apos;t in your estimated total and are collected at
            delivery (plus the same handling fee as other COD items) rather than on the company invoice.
          </p>
        </div>
        {other.enabled && (
          <button type="button"
            onClick={() => setServices(s => ({
              ...s,
              other_pickup: { enabled: false, items: s.other_pickup?.items ?? [{ ...EMPTY_OTHER_ENTRY }] },
            }))}
            className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0">
            <X className="w-3.5 h-3.5" /> Remove All
          </button>
        )}
      </div>
      <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 bg-gray-50/50">
        <OtherPickupFields
          value={services.other_pickup}
          onChange={next => setServices(s => ({ ...s, other_pickup: next }))}
        />
        <p className="text-[11px] text-gray-400 text-center">
          Handled by Sinclair&apos;s Foods · COD — final cost confirmed after purchase and collected at delivery, not on the company invoice
        </p>
      </div>
    </div>
  );
}
