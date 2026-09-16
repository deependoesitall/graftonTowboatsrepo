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
//
// ── THE STEP IN BETWEEN ───────────────────────────────────────
//
// Tapping "send this again" used to drop forty lines into the build with no
// chance to look at them first, and the things most worth looking at are
// exactly the things that do not survive three months in a database:
//
//   · the price moved — an order from July carries July's prices, and the
//     only place that shows up otherwise is the register
//   · the product left the catalog — it comes over as a write-in with an old
//     description and no shelf tag to scan
//   · the boat does not want it this time
//
// RepeatReviewModal puts those three in front of somebody before anything
// lands, with every line tickable and its quantity editable. Nothing about it
// places an order; it is a better handoff into the same builder.

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, RotateCcw, Plus, ChevronDown, ChevronUp, Package, AlertTriangle, Check,
  X, TrendingUp, TrendingDown, PencilLine,
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
  description?: string;
  price?: number;
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

export function RepeatOrderPicker({
  vesselName, companyName, catalogIds: _catalogIds, catalogPrice, onApply,
}: {
  vesselName: string;
  companyName: string;
  /** Product ids currently on the order form, so gone items can be named. */
  catalogIds: Set<string>;
  /** Today's shelf price for a product id, or null when we no longer stock it. */
  catalogPrice: (id: string) => number | null;
  onApply: (lines: RepeatApplyLine[], mode: 'replace' | 'add', carried: CarriedLine[]) => void;
}) {
  const [orders, setOrders] = useState<PastOrder[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  /** The order waiting to be reviewed, and how it was asked for. */
  const [reviewing, setReviewing] = useState<{ order: PastOrder; mode: 'replace' | 'add' } | null>(null);

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
          onApply={mode => setReviewing({ order: o, mode })}
        />
      ))}

      {/* Nothing reaches the build until this is confirmed — see the note at
          the top of this file for why the step is here at all. */}
      {reviewing && (
        <RepeatReviewModal
          order={reviewing.order}
          mode={reviewing.mode}
          catalogPrice={catalogPrice}
          onCancel={() => setReviewing(null)}
          onConfirm={(lines, carried) => {
            const { order: o, mode } = reviewing;
            setReviewing(null);
            onApply(lines, mode, carried);
            setApplied(o.id);
            setTimeout(() => setApplied(null), 2200);
          }}
        />
      )}
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

/* ── the review step ──────────────────────────────────────────────────────── */

interface ReviewLine {
  key: string;
  productId: string | null;
  description: string;
  qty: number;
  /** What this cost on the past order. */
  wasPrice: number;
  /** Today's shelf price, or null when we no longer stock it. */
  nowPrice: number | null;
  paid_by: 'vessel' | 'deck' | 'cod';
  cod_name?: string;
  include: boolean;
}

/** More than a cent, so rounding noise is not reported as a price change. */
const PRICE_EPSILON = 0.005;

function RepeatReviewModal({ order, mode, catalogPrice, onCancel, onConfirm }: {
  order: PastOrder;
  mode: 'replace' | 'add';
  /** Today's price for a product id, or null if it is no longer in the catalog. */
  catalogPrice: (id: string) => number | null;
  onCancel: () => void;
  onConfirm: (lines: RepeatApplyLine[], carried: CarriedLine[]) => void;
}) {
  const [lines, setLines] = useState<ReviewLine[]>(() =>
    order.lines.map((l, i) => {
      const pay: 'vessel' | 'deck' | 'cod' =
        l.paid_by === 'cod' ? 'cod' : l.paid_by === 'deck' ? 'deck' : 'vessel';
      return {
        key: `${l.product_id || 'w'}-${i}`,
        productId: l.product_id,
        description: l.description,
        qty: l.quantity,
        wasPrice: l.unit_price,
        nowPrice: l.product_id ? catalogPrice(l.product_id) : null,
        paid_by: pay,
        cod_name: l.cod_name || undefined,
        include: true,
      };
    }),
  );

  const patch = (key: string, p: Partial<ReviewLine>) =>
    setLines(ls => ls.map(l => (l.key === key ? { ...l, ...p } : l)));

  const kept = lines.filter(l => l.include && l.qty > 0);
  const total = kept.reduce((s, l) => s + (l.nowPrice ?? l.wasPrice) * l.qty, 0);
  const changed = kept.filter(
    l => l.nowPrice != null && Math.abs(l.nowPrice - l.wasPrice) > PRICE_EPSILON,
  );
  const writeIns = kept.filter(l => l.nowPrice == null);

  function confirm() {
    const apply: RepeatApplyLine[] = [];
    const carried: CarriedLine[] = [];
    for (const l of kept) {
      if (!l.productId || l.nowPrice == null) {
        // No catalog row behind it any more — it travels as a write-in with
        // last time's description and price. See the note on product_id in
        // /api/orders for why an absent id is the right wire format.
        carried.push({
          description: l.description,
          qty: l.qty,
          price: l.wasPrice,
          paid_by: l.paid_by,
          cod_name: l.cod_name,
        });
        continue;
      }
      apply.push({
        productId: l.productId,
        qty: l.qty,
        paid_by: l.paid_by,
        cod_name: l.paid_by === 'cod' ? l.cod_name : undefined,
        description: l.description,
        price: l.nowPrice,
      });
    }
    onConfirm(apply, carried);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="font-display font-bold text-brand-navy text-lg">
              {mode === 'replace' ? 'Send this again' : 'Add these to the order'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              From {order.order_number} · {orderDay(order.created_at)} · {daysAgo(order.created_at)}.
              Untick anything the boat doesn&rsquo;t want this time.
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 shrink-0" aria-label="Cancel">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ⚠️ THE TWO THINGS THAT DO NOT SURVIVE THREE MONTHS IN A DATABASE.
            Stated at the top rather than left to be noticed line by line —
            a price that moved is otherwise only discovered at the register. */}
        {(changed.length > 0 || writeIns.length > 0) && (
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 space-y-1">
            {changed.length > 0 && (
              <p className="text-xs text-amber-900">
                <b>{changed.length} price{changed.length === 1 ? ' has' : 's have'} changed</b> since
                that order. The figures below are today&rsquo;s.
              </p>
            )}
            {writeIns.length > 0 && (
              <p className="text-xs text-amber-900">
                <b>{writeIns.length} item{writeIns.length === 1 ? '' : 's'} no longer in the catalog</b> —
                {writeIns.length === 1 ? ' it comes' : ' they come'} over as write-ins at last
                time&rsquo;s price, with no shelf tag to scan.
              </p>
            )}
          </div>
        )}

        <ul className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {lines.map(l => {
            const now = l.nowPrice ?? l.wasPrice;
            const delta = l.nowPrice != null ? l.nowPrice - l.wasPrice : 0;
            const moved = Math.abs(delta) > PRICE_EPSILON;
            return (
              <li key={l.key}
                className={`px-5 py-2.5 flex items-center gap-3 ${l.include ? '' : 'opacity-40'}`}>
                <input
                  type="checkbox" checked={l.include}
                  onChange={e => patch(l.key, { include: e.target.checked })}
                  className="w-4 h-4 shrink-0 accent-brand-navy"
                  aria-label={`Include ${l.description}`}
                />
                <input
                  type="number" min={0} max={999} step="any" value={l.qty}
                  onChange={e => patch(l.key, { qty: Math.max(0, Number(e.target.value) || 0) })}
                  className="input-base w-16 shrink-0 text-sm py-1 text-center tabular-nums"
                  aria-label={`Quantity of ${l.description}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-900 truncate">
                    {l.description}
                    {l.paid_by === 'cod' && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 rounded px-1.5 py-0.5">
                        COD{l.cod_name ? ` · ${l.cod_name}` : ''}
                      </span>
                    )}
                    {l.paid_by === 'deck' && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 rounded px-1.5 py-0.5">
                        Deck
                      </span>
                    )}
                    {l.nowPrice == null && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                        <PencilLine className="w-2.5 h-2.5" /> Write-in
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-gray-400">
                    {formatCurrency(now)} each
                    {moved && (
                      <span className={`ml-1.5 font-semibold inline-flex items-center gap-0.5 ${
                        delta > 0 ? 'text-red-600' : 'text-green-700'
                      }`}>
                        {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        was {formatCurrency(l.wasPrice)}
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-sm tabular-nums text-gray-700 shrink-0">
                  {formatCurrency(now * l.qty)}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-brand-navy">
              {kept.length} line{kept.length === 1 ? '' : 's'} · {formatCurrency(total)}
            </p>
            <p className="text-xs text-gray-400">
              {mode === 'replace'
                ? 'Replaces whatever is in the build now'
                : 'Added to what is already there'}
              {' · '}nothing is placed yet
            </p>
          </div>
          <button type="button" onClick={onCancel} className="btn-outline text-sm px-4 py-2 shrink-0">
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={kept.length === 0}
            className="btn-primary text-sm px-4 py-2 shrink-0 disabled:opacity-40 inline-flex items-center gap-1.5">
            {mode === 'replace' ? <RotateCcw className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {mode === 'replace' ? 'Use these' : 'Add these'}
          </button>
        </div>
      </div>
    </div>
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
