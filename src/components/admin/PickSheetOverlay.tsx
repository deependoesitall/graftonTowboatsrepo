'use client';
// src/components/admin/PickSheetOverlay.tsx
// In-app viewer for the barcode pick sheet — a full-screen overlay with an
// iframe, NOT a new browser window (Deepen: "avoid popping things up in
// separate browsers"). Print goes through the iframe, so only the sheet
// prints, never the admin chrome around it.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Loader2, AlertCircle } from 'lucide-react';
import { buildPickSheetForOrder } from '@/lib/pick-sheet';

export function PickSheetOverlay({ orderId, orderNumber, onClose }: {
  orderId: string;
  orderNumber?: string;
  onClose: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState('');
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let alive = true;
    buildPickSheetForOrder(orderId)
      .then(h => { if (alive) setHtml(h); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load the pick sheet'); });
    return () => { alive = false; };
  }, [orderId]);

  function print() {
    frameRef.current?.contentWindow?.print();
  }

  // PORTAL to <body>: this overlay mounts inside animated modals (order
  // detail, shopping mode) whose transforms would trap position:fixed.
  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/60 flex flex-col">
      {/* Header bar */}
      <div className="bg-brand-navy px-4 py-3 flex items-center justify-between shrink-0">
        <div>
          <p className="text-brand-sky text-[10px] uppercase tracking-wide">Barcode Pick Sheet</p>
          <p className="text-white font-display font-bold">{orderNumber || 'Order'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={print} disabled={!html}
            className="flex items-center gap-1.5 bg-brand-gold text-brand-navy text-sm font-bold px-5 py-2 rounded-lg hover:bg-brand-amber transition-colors disabled:opacity-50">
            <Printer className="w-4 h-4" /> Print
          </button>
          <button onClick={onClose}
            className="flex items-center gap-1.5 text-brand-sky hover:text-white text-sm font-bold px-3 py-2 transition-colors">
            <X className="w-5 h-5" /> Close
          </button>
        </div>
      </div>

      {/* Sheet */}
      <div className="flex-1 bg-gray-200 overflow-hidden">
        {error ? (
          <div className="h-full flex items-center justify-center">
            <div className="bg-white rounded-xl p-6 flex items-center gap-3 text-sm text-red-600">
              <AlertCircle className="w-5 h-5" /> {error}
            </div>
          </div>
        ) : !html ? (
          <div className="h-full flex items-center justify-center text-white">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <iframe
            ref={frameRef}
            srcDoc={html}
            title="Pick sheet"
            className="w-full h-full bg-white"
          />
        )}
      </div>
    </div>,
    document.body
  );
}
