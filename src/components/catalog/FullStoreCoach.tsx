'use client';
// src/components/catalog/FullStoreCoach.tsx
// One friendly coaching line the first time a cook opens "More from Sinclair's".
// Disappears after they've used full-store (local flag).

import { useEffect, useState } from 'react';
import { Store, X } from 'lucide-react';

const FLAG = 'gts_full_store_coached';

export function FullStoreCoach({ storeAll }: { storeAll: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!storeAll) {
      setShow(false);
      return;
    }
    try {
      if (localStorage.getItem(FLAG)) {
        setShow(false);
        return;
      }
    } catch { /* show once anyway */ }
    setShow(true);
    try { localStorage.setItem(FLAG, '1'); } catch { /* fine */ }
  }, [storeAll]);

  if (!show || !storeAll) return null;

  return (
    <div className="mb-4 rounded-xl border border-brand-gold/35 bg-gradient-to-br from-white to-brand-yellow/15 px-4 py-3 flex gap-3 items-start">
      <div className="w-9 h-9 rounded-full bg-brand-orange/10 flex items-center justify-center shrink-0">
        <Store className="w-4 h-4 text-brand-orange" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-brand-navy leading-relaxed">
          <span className="font-bold">Tip: </span>
          This is the whole Sinclair&apos;s aisle — beyond the barge order form.
          Add anything the same way; we&apos;ll still shop it with your boat order.
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setShow(false)}
        className="text-brand-green/40 hover:text-brand-green p-1 shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
