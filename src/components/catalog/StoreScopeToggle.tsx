'use client';
// src/components/catalog/StoreScopeToggle.tsx
// Prominent slider that tells crews AT A GLANCE whether they're looking at the
// everyday "barge order form" or the whole Sinclair's store — and lets them
// flip between the two. Jen (July 20): the old "shop the rest" entry point was
// too hidden; she missed it entirely. This puts it front and center up top.
import Link from 'next/link';
import { ClipboardList, Store } from 'lucide-react';

export function StoreScopeToggle({ storeAll, bargeHref, storeAllHref, bargeCount, fullCount }: {
  storeAll: boolean;
  bargeHref: string;
  storeAllHref: string;
  bargeCount: number;
  fullCount: number;
}) {
  return (
    <div className="mb-4">
      <div className="relative grid grid-cols-2 gap-1 bg-gray-100 border border-gray-200 rounded-2xl p-1">
        {/* Sliding highlight */}
        <span
          className={`absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-xl bg-brand-navy shadow transition-all duration-200 ${
            storeAll ? 'left-[calc(50%+0.125rem)]' : 'left-1'
          }`}
          aria-hidden
        />
        <Link href={bargeHref} scroll={false}
          className={`relative z-10 flex flex-col items-center justify-center py-2.5 rounded-xl text-center transition-colors ${
            !storeAll ? 'text-white' : 'text-gray-500 hover:text-brand-navy'
          }`}>
          <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide">
            <ClipboardList className="w-4 h-4" /> Barge Order Form
          </span>
          <span className={`text-[11px] ${!storeAll ? 'text-white/70' : 'text-gray-400'}`}>
            {bargeCount.toLocaleString()} everyday items
          </span>
        </Link>
        <Link href={storeAllHref} scroll={false}
          className={`relative z-10 flex flex-col items-center justify-center py-2.5 rounded-xl text-center transition-colors ${
            storeAll ? 'text-white' : 'text-gray-500 hover:text-brand-navy'
          }`}>
          <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide">
            <Store className="w-4 h-4" /> Full Sinclair&apos;s Store
          </span>
          <span className={`text-[11px] ${storeAll ? 'text-white/70' : 'text-gray-400'}`}>
            {fullCount.toLocaleString()} total items
          </span>
        </Link>
      </div>
      <p className="text-center text-xs text-gray-400 mt-1.5">
        {storeAll
          ? 'Browsing everything Sinclair’s carries — slide back to the everyday barge order form anytime.'
          : 'You’re on the barge order form — your everyday list. Slide over for the whole Sinclair’s store.'}
      </p>
    </div>
  );
}
