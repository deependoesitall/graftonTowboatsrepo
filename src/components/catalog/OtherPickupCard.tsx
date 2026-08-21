'use client';
// src/components/catalog/OtherPickupCard.tsx
// "Other" third-party item request — lives at the bottom of the Sinclair's
// groceries tab because Sinclair's (not Grafton) handles these pickups.
// Supports MULTIPLE items (Jen: no limit) — each with a link + notes.
// The category sidebar links here via the #other-pickup anchor.

import { useState, useEffect } from 'react';
import { Link2, Check, X, ShoppingBag, Plus, Trash2 } from 'lucide-react';
import { AdditionalServices, OtherPickupItem } from '@/types';
import { getAdditionalServices, saveAdditionalServices } from '@/lib/cart';

const EMPTY_ENTRY: OtherPickupItem = { url: '', notes: '' };

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

  const other = services.other_pickup ?? { enabled: false, items: [{ ...EMPTY_ENTRY }] };
  const entries = other.items?.length ? other.items : [{ ...EMPTY_ENTRY }];

  function patch(p: Partial<AdditionalServices['other_pickup']>) {
    setServices(prev => ({
      ...prev,
      other_pickup: { enabled: false, items: [{ ...EMPTY_ENTRY }], ...prev.other_pickup, ...p },
    }));
  }

  function patchEntry(idx: number, p: Partial<OtherPickupItem>) {
    const next = entries.map((e, i) => (i === idx ? { ...e, ...p } : e));
    patch({ items: next });
  }

  function addEntry() {
    patch({ items: [...entries, { ...EMPTY_ENTRY }] });
  }

  function removeEntry(idx: number) {
    const next = entries.filter((_, i) => i !== idx);
    patch({ items: next.length ? next : [{ ...EMPTY_ENTRY }] });
  }

  const filled = entries.filter(e => e.url.trim() || e.notes.trim());
  const ready = filled.length > 0;

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
            groceries. Add as many as you need — these aren&apos;t included in your estimated total.
          </p>
        </div>
        {other.enabled && (
          <button type="button" onClick={() => patch({ enabled: false })}
            className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0">
            <X className="w-3.5 h-3.5" /> Remove All
          </button>
        )}
      </div>
      <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 bg-gray-50/50">
        {entries.map((entry, idx) => (
          <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Item {idx + 1}</p>
              {entries.length > 1 && (
                <button type="button" onClick={() => removeEntry(idx)}
                  className="flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-600"
                  aria-label={`Remove item ${idx + 1}`}>
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              )}
            </div>
            <div>
              <label className="label-base text-xs">Link to Item</label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="url" className="input-base text-sm pl-9 w-full"
                  placeholder="https://www.walmart.com/…"
                  value={entry.url}
                  onChange={e => patchEntry(idx, { url: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label-base text-xs">Details — size, color, quantity</label>
              <textarea className="input-base text-sm resize-none w-full" rows={2}
                placeholder="e.g. Men's XL, blue, qty 2"
                value={entry.notes}
                onChange={e => patchEntry(idx, { notes: e.target.value })} />
            </div>

            {/* WHO PAYS. Off-catalog requests are often personal — a crew
                member's own TV or cables — and those must not land on the
                company invoice. Same three-tier thinking as the cart lines,
                but only two options here: an outside purchase is either the
                boat's or somebody's own. Defaults to Grocery, matching how
                every request behaved before this existed. */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Paid by</span>
              {([['grocery', 'Grocery'], ['cod', 'COD']] as const).map(([val, lbl]) => {
                const on = (entry.paid_by ?? 'grocery') === val;
                return (
                  <button key={val} type="button"
                    onClick={() => patchEntry(idx, { paid_by: val, ...(val === 'grocery' ? { cod_name: '' } : {}) })}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-colors ${
                      on
                        ? (val === 'cod'
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-brand-navy text-white border-brand-navy')
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}>
                    {lbl}
                  </button>
                );
              })}
              {entry.paid_by === 'cod' && (
                <input type="text"
                  className="input-base text-sm py-1 flex-1 min-w-[140px]"
                  placeholder="Whose is it? e.g. Andy"
                  value={entry.cod_name ?? ''}
                  onChange={e => patchEntry(idx, { cod_name: e.target.value })} />
              )}
            </div>
            {entry.paid_by === 'cod' && !((entry.cod_name ?? '').trim()) && (
              <p className="text-[11px] text-amber-600 font-semibold">
                Add a name so this gets billed to the right person.
              </p>
            )}
          </div>
        ))}

        <button type="button" onClick={addEntry}
          className="flex items-center gap-1.5 text-xs font-bold text-brand-river hover:text-brand-navy transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add another item
        </button>

        {!other.enabled && (
          ready
            ? <button type="button" onClick={() => patch({ enabled: true })}
                className="w-full btn-gold py-2.5 flex items-center justify-center gap-2 rounded-lg text-sm font-bold">
                <Check className="w-4 h-4" /> Add {filled.length > 1 ? `${filled.length} Items` : ''} to Order
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
