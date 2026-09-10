'use client';
// src/app/shop/page.tsx — the Sinclair's picking queue.
//
// Deliberately the thinnest possible thing: a list of orders with something to
// shop, tapped to open the picking flow that already exists.
//
// ShoppingModeModal IS THE APP. It already does aisle ordering, weight items,
// substitutions and the barcode handoff, and Sinclair's staff have used it
// inside the admin panel. Writing a second picking UI two days before launch
// — with a boat ordering the next morning — would mean shipping untested
// screens to replace tested ones. This route only answers "which order do I
// pick next", which is the one thing the admin panel made them hunt for.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShoppingBasket, RefreshCw, Package } from 'lucide-react';
import { Order } from '@/types';
import { adminFetch } from '@/lib/admin-auth';
import { formatCurrency } from '@/lib/utils';
import { ShoppingModeModal } from '@/components/admin/ShoppingModeModal';
import PushBell from '@/components/admin/PushBell';

/** Orders still to pick. Anything shopped, delivered or cancelled is done. */
const OPEN_STATUSES = ['new', 'in_progress'];

export default function ShopQueue() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<Order | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await adminFetch('/api/orders?limit=100');
      if (!res.ok) throw new Error('Could not load orders');
      const data = await res.json();
      const list: Order[] = data.orders || data || [];
      setOrders(
        list.filter(o =>
          OPEN_STATUSES.includes(o.status) &&
          // Service-only orders are crew change, not shopping. They aren't
          // Sinclair's work and shouldn't clutter the queue — the same
          // item_type test that decides the email CC and the push audience.
          (o.items || []).some(i => i.item_type !== 'service'),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh when the app comes back to the foreground. A shopper taps a push
  // notification, picks the order, then switches back later — without this the
  // list shows a stale queue and they re-pick something already done.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-xl font-bold text-brand-navy flex items-center gap-2">
            <ShoppingBasket className="w-5 h-5 text-brand-green" />
            To shop
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? 'Loading…' : `${orders.length} order${orders.length === 1 ? '' : 's'} waiting`}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-white disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Same component as the GTS app, pointed at THIS origin's install
          guide. Renders nothing until VAPID keys are configured. */}
      <div className="mb-4">
        <PushBell installHref="/install" />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {loading && !orders.length && (
        <div className="py-16 text-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300 mx-auto" /></div>
      )}

      {!loading && !orders.length && !error && (
        <div className="py-16 text-center">
          <Package className="w-8 h-8 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Nothing to shop right now.</p>
          <p className="text-xs text-gray-300 mt-1">New orders will show up here.</p>
        </div>
      )}

      <ul className="space-y-2.5">
        {orders.map(o => {
          const count = (o.items || [])
            .filter(i => i.item_type !== 'service')
            .reduce((s, i) => s + i.quantity, 0);
          return (
            <li key={o.id}>
              {/* Big tap target on purpose — this gets used one-handed, in a
                  store, often holding something else. */}
              <button onClick={() => setActive(o)}
                className="w-full text-left bg-white rounded-2xl border border-gray-200 px-4 py-3.5 hover:border-brand-green/40 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-brand-navy truncate">
                      {o.vessel_name || o.company_name || 'Vessel'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      #{o.order_number}
                      {o.company_name && o.vessel_name ? ` · ${o.company_name}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-brand-green">{count}</p>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400">items</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-100">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    o.status === 'new' ? 'bg-brand-green/10 text-brand-green' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {o.status === 'new' ? 'New' : 'Started'}
                  </span>
                  <span className="text-xs text-gray-400">{formatCurrency(o.subtotal)}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {active && (
        <ShoppingModeModal
          order={active}
          onClose={() => { setActive(null); load(); }}
          onComplete={() => { setActive(null); load(); }}
        />
      )}
    </div>
  );
}
