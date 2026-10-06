'use client';
// src/components/admin/OrderFocusCard.tsx
//
// Compact landing for GTS notifications (?focus=new|handoff). Shows what
// changed and when it delivers; the full order (items, billing, edits) is one
// tap away. Opening an order any other way still goes straight to the full
// OrderDetailModal, unchanged.

import { useEffect } from 'react';
import { Store, Truck, X } from 'lucide-react';
import { Order } from '@/types';
import { formatDate, formatArrivalTime, orderItemCount } from '@/lib/utils';

export function isOrderFocus(focus: string | null | undefined): focus is 'new' | 'handoff' {
  return focus === 'new' || focus === 'handoff';
}

export function OrderFocusCard({
  order,
  focus,
  onOpen,
  onClose,
}: {
  order: Order;
  focus: 'new' | 'handoff';
  onOpen: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groceries = (order.items || []).filter(i => i.item_type !== 'service');
  const count = orderItemCount(groceries);
  const when = [order.arrival_date, formatArrivalTime(order.arrival_time)].filter(Boolean).join(', ');
  const delivered = order.handoff === 'delivered_to_gts';
  const boxed = order.handoff === 'awaiting_gts_pickup';
  const showHandoff = focus === 'handoff' && (delivered || boxed);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl shadow-xl pb-[env(safe-area-inset-bottom)]"
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Order ${order.order_number}`}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            <p className="text-xs text-gray-400">{focus === 'new' ? 'New order' : 'Order'} {order.order_number}</p>
            <h3 className="font-bold text-brand-navy truncate">{order.vessel_name || order.company_name}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 -m-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {showHandoff && (
            <div className={`rounded-xl border px-3 py-2.5 ${delivered
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-orange-50 border-orange-200 text-orange-900'}`}>
              <p className="font-bold text-sm flex items-center gap-1.5">
                {delivered
                  ? <><Truck className="w-4 h-4" /> At Grafton, in the cooler</>
                  : <><Store className="w-4 h-4" /> Boxed at Sinclair&apos;s</>}
              </p>
              {(order.handoff_by || order.handoff_at) && (
                <p className="text-xs mt-0.5">
                  {[order.handoff_by, order.handoff_at ? formatDate(order.handoff_at) : ''].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          )}

          <dl className="text-sm grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
            {when && <><dt className="text-gray-400">Deliver</dt><dd className="text-brand-navy font-semibold">{when}</dd></>}
            {order.terminal_name && <><dt className="text-gray-400">Where</dt><dd className="text-brand-navy">{order.terminal_name}</dd></>}
            {order.eta && <><dt className="text-gray-400">ETA</dt><dd className="text-brand-navy">{order.eta}</dd></>}
            {count > 0 && <><dt className="text-gray-400">Items</dt><dd className="text-brand-navy">{count}</dd></>}
          </dl>

          <button type="button" onClick={onOpen}
            className="btn-primary w-full text-sm min-h-[44px] flex items-center justify-center">
            Open order
          </button>
        </div>
      </div>
    </div>
  );
}
