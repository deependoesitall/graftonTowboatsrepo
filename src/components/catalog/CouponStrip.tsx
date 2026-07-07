'use client';
// src/components/catalog/CouponStrip.tsx
// Horizontal strip of Sinclair's digital coupons on the catalog.
// Every card is clickable → modal with the FULL offer text (nothing truncated).
import { useState } from 'react';
import Link from 'next/link';
import { BadgePercent, X } from 'lucide-react';

export interface StripCoupon {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  offer_value: string | null;
  cover_image_url: string | null;
  finish_date: string | null;
}

function expiry(c: StripCoupon): string | null {
  if (!c.finish_date) return null;
  return new Date(c.finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function CouponStrip({ coupons, total }: { coupons: StripCoupon[]; total: number }) {
  const [selected, setSelected] = useState<StripCoupon | null>(null);

  if (!coupons.length) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
        <p className="flex items-center gap-1.5 text-xs font-bold text-brand-navy uppercase tracking-wide">
          <BadgePercent className="w-3.5 h-3.5 text-brand-orange" /> Sinclair&apos;s Digital Coupons
          <span className="font-normal normal-case text-gray-400">— top picks · tap one for details</span>
        </p>
        <Link href="/coupons" className="text-xs font-bold text-brand-river hover:underline whitespace-nowrap">
          View all {total.toLocaleString()} coupons →
        </Link>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {coupons.map(c => (
          <button key={c.id} type="button" onClick={() => setSelected(c)}
            className="shrink-0 w-40 snap-start border border-gray-100 rounded-lg p-2.5 bg-gray-50/50 text-left hover:border-brand-orange/40 hover:shadow-sm transition-all cursor-pointer">
            {c.cover_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.cover_image_url} alt={c.brand || c.name}
                loading="lazy" decoding="async"
                className="w-full h-16 object-contain mb-1.5 mix-blend-multiply" />
            )}
            <p className="text-xs font-bold text-brand-orange leading-tight">{c.offer_value ? `${c.offer_value} off` : c.name}</p>
            {c.brand && <p className="text-[10px] font-semibold text-brand-navy truncate">{c.brand}</p>}
            {c.description && <p className="text-[10px] text-gray-500 leading-snug line-clamp-2">{c.description}</p>}
            {expiry(c) && <p className="text-[9px] text-gray-400 mt-1">thru {expiry(c)}</p>}
          </button>
        ))}
      </div>

      {/* Full coupon detail */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-orange bg-orange-50 border border-orange-200 rounded-full px-2.5 py-1">
                <BadgePercent className="w-3.5 h-3.5" /> Digital coupon
              </span>
              <button onClick={() => setSelected(null)} aria-label="Close" className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {selected.cover_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.cover_image_url} alt={selected.brand || selected.name}
                className="w-full h-36 object-contain mb-3 mix-blend-multiply" />
            )}
            <p className="text-xl font-bold text-brand-orange leading-tight">
              {selected.offer_value ? `${selected.offer_value} off` : selected.name}
            </p>
            {selected.brand && <p className="text-sm font-semibold text-brand-navy mt-0.5">{selected.brand}</p>}
            {selected.description && (
              <p className="text-sm text-gray-600 leading-relaxed mt-2">{selected.description}</p>
            )}
            {expiry(selected) && (
              <p className="text-xs text-gray-400 mt-3">Valid through {expiry(selected)}</p>
            )}
            <p className="text-xs text-gray-400 mt-3 border-t border-gray-100 pt-3">
              No clipping needed — Sinclair&apos;s applies this saving when your order is shopped, and it
              shows on your final invoice.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
