'use client';
// src/components/catalog/OtherPickupCard.tsx
// "Other" third-party item request — lives at the bottom of the Sinclair's
// groceries tab because Sinclair's (not Grafton) handles these pickups.
// Paste a link to the item + notes (size, color, quantity). No file uploads.

import { useState, useEffect } from 'react';
import { Link2, Check, X, ShoppingBag } from 'lucide-react';
import { AdditionalServices } from '@/types';
import { getAdditionalServices, saveAdditionalServices } from '@/lib/cart';

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

  const other = services.other_pickup ?? { enabled: false, url: '', notes: '' };

  function patch(p: Partial<AdditionalServices['other_pickup']>) {
    setServices(prev => ({ ...prev, other_pickup: { ...(prev.other_pickup ?? { enabled: false, url: '', notes: '' }), ...p } }));
  }

  const ready = !!(other.url.trim() || other.notes.trim());

  return (
    <div className={`card-base overflow-hidden mt-8 ${other.enabled ? 'ring-2 ring-brand-green/40' : ''}`}>
      <div className="flex items-center gap-4 p-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          other.enabled ? 'bg-brand-green text-white' : 'bg-gray-100 text-gray-400'
        }`}>
          {other.enabled ? <Check className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-display font-bold text-sm ${other.enabled ? 'text-brand-green' : 'text-brand-navy'}`}>
            Need something we don&apos;t carry?
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Paste a link to an item from another store and Sinclair&apos;s will pick it up with your groceries.
            Small items only (e.g. a Walmart run).
          </p>
        </div>
        {other.enabled && (
          <button type="button" onClick={() => patch({ enabled: false })}
            className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0">
            <X className="w-3.5 h-3.5" /> Remove
          </button>
        )}
      </div>
      <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 bg-gray-50/50">
        <div>
          <label className="label-base text-xs">Link to Item</label>
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="url" className="input-base text-sm pl-9 w-full"
              placeholder="https://www.walmart.com/…"
              value={other.url}
              onChange={e => patch({ url: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label-base text-xs">Details — size, color, quantity</label>
          <textarea className="input-base text-sm resize-none w-full" rows={2}
            placeholder="e.g. Men's XL, blue, qty 2"
            value={other.notes}
            onChange={e => patch({ notes: e.target.value })} />
        </div>
        {!other.enabled && (
          ready
            ? <button type="button" onClick={() => patch({ enabled: true })}
                className="w-full btn-gold py-2.5 flex items-center justify-center gap-2 rounded-lg text-sm font-bold">
                <Check className="w-4 h-4" /> Add to Order
              </button>
            : <p className="text-xs text-gray-400 text-center pt-1">Add a link or details above to include this with your order.</p>
        )}
        <p className="text-[11px] text-gray-400 text-center">
          Handled by Sinclair&apos;s Foods · final cost confirmed after purchase and billed on your monthly invoice
        </p>
      </div>
    </div>
  );
}
