'use client';
// src/components/admin/RepeatOrderPicker.tsx
//
// THIS BOAT'S LAST FEW ORDERS, READY TO SEND AGAIN.
//
// Boats order the same things. A towboat's galley runs a rotation and the list
// barely moves from trip to trip — which is why the storefront has had a
// one-tap Reorder for signed-in captains since launch, and why the people
// taking those same orders by phone had nothing at all. They retyped forty
// lines a fortnight that were already sitting in the database.
//
// ── WHAT THIS IS SHAPED AROUND ───────────────────────────────────────────
//
// Choosing between past orders is a recognition task, not a reading one. Jen
// knows which order she wants from the date and roughly what was on it, so each
// card leads with when, then the money and the count, then the first few items
// as a jog to the memory — and the rest one tap away for the times that isn't
// enough. No table, no columns to scan.
//
// Two ways to take one, because both are real: REPLACE for "send that again",
// ADD for "same as last time plus a few things". Neither ever submits. The
// items land in the same draft the order form and the scanner feed, and the
// person still reviews and places the order.

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, RotateCcw, Plus, ChevronDown, ChevronUp, Package, AlertTriangle, Check,
} from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { formatCurrency } from '@/lib/utils';

interface PastLine {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  paid_by: string | null;
  cod_name: string | null;
}

interface PastOrder {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  subtotal: number;
  terminal_name: string | null;
  arrival_date: string | null;
  delivery_method: string | null;
  lines: PastLine[];
}

export interface RepeatApplyLine {
  productId: string;
  qty: number;
  /** ⚠️ 'deck' is a real bucket — company-billed but outside the grocery
   *  allowance. Collapsing it into 'vessel' moves money between two lines of
   *  Mary Karen's invoice without telling anyone. */
  paid_by?: 'vessel' | 'deck' | 'cod';
  cod_name?: string;
}

/** A line whose product has left the printed form — carried, not discarded. */
export interface CarriedLine {
  description: string;
  qty: number;
  price: number;
  paid_by?: 'vessel' | 'deck' | 'cod';
  cod_name?: string;
}

/** "Sat 13 Sep" — the way someone refers to an order out loud. */
function orderDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

function daysAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const n = Math.round((Date.now() - d) / 86400000);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 30) return `${n} days ago`;
  const m = Math.round(n / 30);
  return m === 1 ? 'a month ago' : `${m} months ago`;
}

export function RepeatOrderPicker({ vesselName, companyName, catalogIds, onApply }: {
  vesselName: string;
  companyName: string;
  /** Product ids currently on the order form, so gone items can be named. */
  catalogIds: Set<string>;
  onApply: (lines: RepeatApplyLine[], mode: 'replace' | 'add', carried: CarriedLine[]) => void;
}) {
  const [orders, setOrders] = useState<PastOrder[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  useEffect(() => {
    const v = vesselName.trim();
    if (v.length < 2) { setOrders(null); return; }
    let cancelled = false;
    setBusy(true);
    (async () => {
      try {
        const res = await adminFetch(
          `/api/admin/vessel-orders?vessel=${encodeURIComponent(v)}&company=${encodeURIComponent(companyName.trim())}`,
        );
        if (cancelled) return;
        setOrders(res.ok ? (await res.json()).orders || [] : []);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [vesselName, companyName]);

  if (!vesselName.trim()) {
    return (
      <div className="card-base p-6 text-center">
        <Package className="w-5 h-5 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Choose a boat first and its past orders show up here.</p>
      </div>
    );
  }

  if (busy && !orders) {
    return (
      <div className="card-base p-6 flex items-center justify-center gap-2 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Looking up {vesselName}&rsquo;s orders…
      </div>
    );
  }

  if (orders && orders.length === 0) {
    return (
      <div className="card-base p-6 text-center">
        <p className="text-sm text-gray-600 font-medium">No past orders for {vesselName}</p>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
          This boat has been delivered to but never had an order built here. Build this one and
          it&rsquo;ll be ready to repeat next time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {(orders || []).map(o => (
        <OrderCard
          key={o.id}
          order={o}
          expanded={open === o.id}
          justApplied={applied === o.id}
          onToggle={() => setOpen(open === o.id ? null : o.id)}
          onApply={(mode) => {
            const lines: RepeatApplyLine[] = [];
            const carried: CarriedLine[] = [];
            for (const l of o.lines) {
              const pay: 'vessel' | 'deck' | 'cod' =
                l.paid_by === 'cod' ? 'cod' : l.paid_by === 'deck' ? 'deck' : 'vessel';
              // A product that has left the printed order form has no id the
              // builder can hang a quantity on — but the boat still ordered it.
              // It crosses over as a write-in carrying its old description and
              // price, rather than disappearing. A cook noticing his coffee
              // never arrived is a worse way to find out.
              if (!l.product_id || !catalogIds.has(l.product_id)) {
                carried.push({
                  description: l.description,
                  qty: l.quantity,
                  price: l.unit_price,
                  paid_by: pay,
                  cod_name: l.cod_name || undefined,
                });
                continue;
              }
              lines.push({
                productId: l.product_id,
                qty: l.quantity,
                paid_by: pay,
                cod_name: pay === 'cod' ? (l.cod_name || undefined) : undefined,
              });
            }
            onApply(lines, mode, carried);
            setApplied(o.id);
            setTimeout(() => setApplied(null), 2200);
          }}
        />
      ))}
    </div>
  );
}

function OrderCard({ order, expanded, justApplied, onToggle, onApply }: {
  order: PastOrder;
  expanded: boolean;
  justApplied: boolean;
  onToggle: () => void;
  onApply: (mode: 'replace' | 'add') => void;
}) {
  const count = useMemo(
    () => order.lines.reduce((s, l) => s + l.quantity, 0),
    [order.lines],
  );
  const preview = order.lines.slice(0, 3).map(l => l.description).join(' · ');
  const rest = order.lines.length - 3;

  return (
    <article className={`rounded-xl border bg-white overflow-hidden transition-colors ${
      justApplied ? 'border-green-300 ring-1 ring-green-200' : 'border-gray-200'
    }`}>
      <div className="p-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="font-display text-lg font-bold text-brand-navy leading-none">
            {orderDay(order.created_at)}
          </h3>
          <span className="text-xs text-gray-400">{daysAgo(order.created_at)}</span>
          <span className="ml-auto text-sm font-bold text-brand-navy tabular-nums">
            {formatCurrency(order.subtotal)}
          </span>
        </div>

        <p className="text-xs text-gray-400 mt-1 font-mono">{order.order_number}</p>

        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          <b className="text-brand-navy font-semibold">{count} item{count === 1 ? '' : 's'}</b>
          {preview ? <> — {preview}</> : null}
          {rest > 0 && <span className="text-gray-400"> +{rest} more</span>}
        </p>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            type="button" onClick={() => onApply('replace')}
            className="btn-primary text-xs px-3 py-2 inline-flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> Send this again
          </button>
          <button
            type="button" onClick={() => onApply('add')}
            className="btn-outline text-xs px-3 py-2 inline-flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add to this order
          </button>
          <button
            type="button" onClick={onToggle}
            className="ml-auto text-xs font-semibold text-brand-navy/60 hover:text-brand-navy inline-flex items-center gap-1">
            {expanded ? <>Hide <ChevronUp className="w-3 h-3" /></> : <>All {order.lines.length} lines <ChevronDown className="w-3 h-3" /></>}
          </button>
        </div>

        {justApplied && (
          <p className="mt-3 text-xs text-green-700 font-semibold inline-flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Added to the order below — review before you place it.
          </p>
        )}
      </div>

      {expanded && (
        <ul className="border-t border-gray-100 divide-y divide-gray-50 bg-gray-50/50">
          {order.lines.map((l, i) => (
            <li key={i} className="px-4 py-2 flex items-center gap-3 text-sm">
              <span className="w-10 shrink-0 text-right tabular-nums text-gray-500">{l.quantity} ×</span>
              <span className="min-w-0 flex-1 truncate text-gray-800">{l.description}</span>
              {l.paid_by === 'cod' && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 rounded px-1.5 py-0.5 shrink-0">
                  COD{l.cod_name ? ` · ${l.cod_name}` : ''}
                </span>
              )}
              <span className="tabular-nums text-gray-400 shrink-0">
                {formatCurrency(l.unit_price * l.quantity)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** Shown by the builder when a repeat could not bring everything across. */
export function MissingLinesNotice({ missing, onDismiss }: {
  missing: string[]; onDismiss: () => void;
}) {
  if (!missing.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900">
          {missing.length} line{missing.length === 1 ? '' : 's'} came over as write-ins
        </p>
        <p className="text-xs text-amber-800/80 mt-0.5 leading-relaxed">
          These aren&rsquo;t on the printed order form any more, so they&rsquo;re on the order with
          last time&rsquo;s description and price. Check the price at the register, or remove them
          below if the boat no longer wants them.
        </p>
        <ul className="mt-1.5 text-xs text-amber-900 space-y-0.5">
          {missing.map((m, i) => <li key={i}>· {m}</li>)}
        </ul>
      </div>
      <button onClick={onDismiss} className="text-xs font-semibold text-amber-700 hover:text-amber-900 shrink-0">
        Got it
      </button>
    </div>
  );
}
