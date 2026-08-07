'use client';
// src/components/admin/PickSheetOverlay.tsx
// In-app viewer for the barcode pick sheet — a full-screen overlay with an
// iframe, NOT a new browser window (Deepen: "avoid popping things up in
// separate browsers"). Print goes through the iframe, so only the sheet
// prints, never the admin chrome around it.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Loader2, AlertCircle, Check } from 'lucide-react';
import { buildPickSheetForOrder } from '@/lib/pick-sheet';
import { adminFetch } from '@/lib/admin-auth';
import { formatCurrency } from '@/lib/utils';

export function PickSheetOverlay({ orderId, orderNumber, onClose, registerStep = false, estimatedTotal, initialRegisterTotal }: {
  orderId: string;
  orderNumber?: string;
  onClose: () => void;
  /** True right after shopping completes — the register run. Shows the
   *  register-total entry, which is Sinclair's final confirming step. */
  registerStep?: boolean;
  estimatedTotal?: number;
  initialRegisterTotal?: number | null;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState('');
  const frameRef = useRef<HTMLIFrameElement>(null);

  // ── Register total: what Sinclair's actually rang after scanning ──
  const [regTotal, setRegTotal] = useState(initialRegisterTotal != null ? String(initialRegisterTotal) : '');
  const [savingTotal, setSavingTotal] = useState(false);
  const [savedTotal, setSavedTotal] = useState(initialRegisterTotal != null);
  const [totalError, setTotalError] = useState('');

  async function saveRegisterTotal() {
    const val = parseFloat(regTotal);
    if (!regTotal || isNaN(val) || val < 0) { setTotalError('Enter the total from the register.'); return; }
    setSavingTotal(true); setTotalError('');
    try {
      const res = await adminFetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ register_total: val }),
      });
      if (!res.ok) throw new Error('Could not save — try again');
      setSavedTotal(true);
    } catch (e) {
      setTotalError(e instanceof Error ? e.message : 'Could not save — try again');
    } finally {
      setSavingTotal(false);
    }
  }

  const regNum = parseFloat(regTotal);
  const variance = estimatedTotal != null && !isNaN(regNum) ? regNum - estimatedTotal : null;

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
            <X className="w-5 h-5" /> {registerStep ? 'Done' : 'Close'}
          </button>
        </div>
      </div>

      {/* ── FINAL STEP: the total the register actually rang ──
          Sinclair's scans this sheet, then types the register total here to
          confirm the order is shopped. Sits right on the register screen so
          it can't be missed or hunted for in another view. */}
      {registerStep && (
        <div className={`shrink-0 px-4 py-3 border-b-2 ${savedTotal ? 'bg-green-50 border-green-300' : 'bg-brand-gold/20 border-brand-gold'}`}>
          <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-bold text-brand-navy">
                {savedTotal ? '✓ Register total saved' : 'Last step — enter the register total'}
              </p>
              <p className="text-xs text-gray-600">
                {savedTotal
                  ? 'This order is confirmed shopped. You can close this window.'
                  : 'Scan the barcodes above, then type the total the register shows.'}
                {estimatedTotal != null && <> Estimated: <strong>{formatCurrency(estimatedTotal)}</strong></>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gray-500">$</span>
              <input
                type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
                value={regTotal}
                onChange={e => { setRegTotal(e.target.value); setSavedTotal(false); }}
                onKeyDown={e => { if (e.key === 'Enter') saveRegisterTotal(); }}
                className="w-36 text-right text-lg font-bold text-brand-navy border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-navy"
              />
              <button onClick={saveRegisterTotal} disabled={savingTotal || !regTotal}
                className={`flex items-center gap-1.5 text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 ${
                  savedTotal ? 'bg-green-600 text-white' : 'bg-brand-green text-white hover:bg-brand-gmed'
                }`}>
                {savingTotal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {savedTotal ? 'Saved' : 'Save total'}
              </button>
            </div>
          </div>
          {/* Variance is informational — weighed items and price changes make
              small differences normal; a big gap is worth a second look. */}
          {variance != null && Math.abs(variance) > 1 && !savingTotal && (
            <p className={`max-w-4xl mx-auto text-xs mt-1.5 ${Math.abs(variance) > 25 ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>
              {variance > 0 ? '+' : ''}{formatCurrency(variance)} vs the estimate
              {Math.abs(variance) > 25 ? ' — double-check for a missed substitution or weight.' : ' (normal for weighed items).'}
            </p>
          )}
          {totalError && <p className="max-w-4xl mx-auto text-xs text-red-600 mt-1">{totalError}</p>}
        </div>
      )}

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
