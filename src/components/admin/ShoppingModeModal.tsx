'use client';
// src/components/admin/ShoppingModeModal.tsx
// Phase 2a: Full-screen shopping mode for staff to process an order item by item.
// Phase 2b: Confirmation dialog, in_progress auto-advance awareness, UX polish.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Check, PackageX, Scale, Search, ShoppingCart,
  ChevronRight, Loader2, CheckCircle2, AlertTriangle,
  Clock, MapPin, List,
} from 'lucide-react';
import { Order, OrderItem, Product } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-auth';
import { groupByWalkingOrder, DEFAULT_ZONE_ORDER, NO_LOCATION_LABEL } from '@/lib/store-layout';

interface ShoppingModeModalProps {
  order: Order;
  onClose: () => void;
  onComplete: () => void;
}

type UiState = 'idle' | 'weight_entry' | 'sub_search';

interface ItemUiState {
  uiState: UiState;
  weightInput: string;
  subSearch: string;
  subResults: Product[];
  subSearching: boolean;
  subSelected: Product | null;
  subQty: string;
  saving: boolean;
  justSaved: boolean; // triggers green flash
  saveError: string;  // non-empty = last save failed
}

const defaultItemUiState = (): ItemUiState => ({
  uiState: 'idle',
  weightInput: '',
  subSearch: '',
  subResults: [],
  subSearching: false,
  subSelected: null,
  subQty: '1',
  saving: false,
  justSaved: false,
  saveError: '',
});

function isWeightItem(item: OrderItem) {
  return item.uom?.toUpperCase() === 'LB';
}

// ── CONFIRMATION DIALOG ───────────────────────────────────────────────────────

interface ConfirmDialogProps {
  customerEmail?: string;
  pendingItems: OrderItem[];
  onConfirm: () => void;
  onCancel: () => void;
  completing: boolean;
}

function ConfirmCompleteDialog({ customerEmail, pendingItems, onConfirm, onCancel, completing }: ConfirmDialogProps) {
  const hasPending = pendingItems.length > 0;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${hasPending ? 'bg-red-100' : 'bg-amber-100'}`}>
            <AlertTriangle className={`w-5 h-5 ${hasPending ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <h3 className="font-display text-lg font-bold text-brand-navy">Complete Order?</h3>
        </div>

        {/* Unprocessed items warning */}
        {hasPending && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm font-bold text-red-700 mb-1.5">
              ⚠ {pendingItems.length} item{pendingItems.length !== 1 ? 's' : ''} not yet actioned:
            </p>
            <ul className="space-y-0.5">
              {pendingItems.slice(0, 5).map(i => (
                <li key={i.id} className="text-xs text-red-600 flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0">•</span>
                  <span>{i.description}{i.quantity !== 1 ? ` ×${i.quantity}` : ''}</span>
                </li>
              ))}
              {pendingItems.length > 5 && (
                <li className="text-xs text-red-500 italic">+ {pendingItems.length - 5} more</li>
              )}
            </ul>
            <p className="text-xs text-red-500 mt-2">
              These items will remain <strong>pending</strong> on the final order.
            </p>
          </div>
        )}

        <p className="text-sm text-gray-600 mb-2">
          This will mark the order as <strong className="text-brand-green">Fulfilled</strong> and cannot be undone.
        </p>
        {customerEmail ? (
          <p className="text-sm text-gray-600 mb-6">
            The <strong>Order Shopped</strong> email with the final PDF will be sent to{' '}
            <span className="font-semibold text-brand-navy">{customerEmail}</span>.
          </p>
        ) : (
          <p className="text-sm text-gray-600 mb-6">
            No customer email is on file — the Order Shopped email will be skipped.
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={completing}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={completing}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
              hasPending
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-brand-green hover:bg-brand-gmed'
            }`}
          >
            {completing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Completing…</>
              : <><CheckCircle2 className="w-4 h-4" /> {hasPending ? 'Complete Anyway' : 'Confirm & Send'}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN MODAL ────────────────────────────────────────────────────────────────

export function ShoppingModeModal({ order, onClose, onComplete }: ShoppingModeModalProps) {
  const [items, setItems] = useState<OrderItem[]>(order.items);
  const [itemUi, setItemUi] = useState<Record<string, ItemUiState>>(() =>
    Object.fromEntries(order.items.map(i => [i.id, defaultItemUiState()]))
  );
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [loadingFresh, setLoadingFresh] = useState(true);

  // ── Aisle grouping — Sinclair's item locations sorted into walking order ──
  // Default view: By Aisle (falls back to By Category when nothing has a location)
  const [viewMode, setViewMode] = useState<'aisle' | 'category'>('aisle');
  const [zoneOrder, setZoneOrder] = useState<string[]>(DEFAULT_ZONE_ORDER);
  useEffect(() => {
    fetch('/api/order-config')
      .then(r => r.ok ? r.json() : null)
      .then(cfg => { if (cfg?.store_zone_order?.length) setZoneOrder(cfg.store_zone_order); })
      .catch(() => {});
  }, []);

  // On mount: always fetch the latest item state from the DB so that
  // reopening shopping mode after a crash/restart shows real progress,
  // not a stale snapshot from when the orders list last loaded.
  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch(`/api/orders/${order.id}`);
        if (res.ok) {
          const fresh = await res.json();
          const freshItems: OrderItem[] = fresh.items || [];
          setItems(freshItems);
          setItemUi(prev => {
            const next = { ...prev };
            freshItems.forEach(i => {
              if (!next[i.id]) next[i.id] = defaultItemUiState();
            });
            return next;
          });
        }
      } catch {
        // If fetch fails, fall back to the prop data already in state
      } finally {
        setLoadingFresh(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flash timer refs — clear on unmount
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const timers = flashTimers.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  const originals = items.filter(i => !i.is_substitution);
  const pending = originals.filter(i => i.shopping_status === 'pending');
  const processed = originals.filter(i => i.shopping_status !== 'pending');
  const allDone = pending.length === 0;
  const progressPct = originals.length ? (processed.length / originals.length) * 100 : 0;

  // ── helpers ────────────────────────────────────────────────────────────────

  function setUi(itemId: string, patch: Partial<ItemUiState>) {
    setItemUi(prev => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  function flashSaved(itemId: string) {
    setUi(itemId, { justSaved: true });
    if (flashTimers.current[itemId]) clearTimeout(flashTimers.current[itemId]);
    flashTimers.current[itemId] = setTimeout(() => {
      setUi(itemId, { justSaved: false });
    }, 1800);
  }

  function updateItem(updated: OrderItem) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === updated.id);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }

  function addItem(newItem: OrderItem) {
    setItemUi(prev => ({ ...prev, [newItem.id]: defaultItemUiState() }));
    setItems(prev => [...prev, newItem]);
  }

  // ── SHOPPED ────────────────────────────────────────────────────────────────

  async function markShopped(item: OrderItem) {
    setUi(item.id, { saving: true, saveError: '' });
    try {
      const res = await adminFetch(`/api/orders/${order.id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'shopped' }),
      });
      if (!res.ok) throw new Error('Save failed — tap to retry');
      const { item: updated } = await res.json();
      updateItem(updated);
      flashSaved(item.id);
    } catch (e) {
      setUi(item.id, { saveError: e instanceof Error ? e.message : 'Save failed — tap to retry' });
    } finally {
      setUi(item.id, { saving: false });
    }
  }

  // ── SET WEIGHT ─────────────────────────────────────────────────────────────

  async function confirmWeight(item: OrderItem) {
    const weight = parseFloat(itemUi[item.id]?.weightInput || '');
    if (!weight || weight <= 0) return;
    setUi(item.id, { saving: true, saveError: '' });
    try {
      const res = await adminFetch(`/api/orders/${order.id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_weight', actual_weight: weight }),
      });
      if (!res.ok) throw new Error('Save failed — tap to retry');
      const { item: updated } = await res.json();
      updateItem(updated);
      setUi(item.id, { uiState: 'idle' });
      flashSaved(item.id);
    } catch (e) {
      setUi(item.id, { saveError: e instanceof Error ? e.message : 'Save failed — tap to retry' });
    } finally {
      setUi(item.id, { saving: false });
    }
  }

  // ── SUBSTITUTION ──────────────────────────────────────────────────────────

  const searchProducts = useCallback(async (itemId: string, q: string) => {
    if (q.trim().length < 2) { setUi(itemId, { subResults: [] }); return; }
    setUi(itemId, { subSearching: true });
    try {
      const res = await adminFetch(`/api/products?search=${encodeURIComponent(q)}&status=active&per_page=12`);
      const { products } = await res.json();
      setUi(itemId, { subResults: products || [] });
    } finally {
      setUi(itemId, { subSearching: false });
    }
  }, []);

  async function confirmSubstitution(item: OrderItem) {
    const ui = itemUi[item.id];
    if (!ui?.subSelected) return;
    const qty = parseInt(ui.subQty) || 1;
    setUi(item.id, { saving: true, saveError: '' });
    try {
      const res = await adminFetch(`/api/orders/${order.id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'out_of_stock',
          substitution: { product_id: ui.subSelected.id, quantity: qty },
        }),
      });
      if (!res.ok) throw new Error('Save failed — tap to retry');
      const { item: updated, substitution } = await res.json();
      updateItem(updated);
      if (substitution) addItem(substitution);
      setUi(item.id, { uiState: 'idle', subSelected: null, subSearch: '', subResults: [] });
      flashSaved(item.id);
      if (substitution) flashSaved(substitution.id);
    } catch (e) {
      setUi(item.id, { saveError: e instanceof Error ? e.message : 'Save failed — tap to retry' });
    } finally {
      setUi(item.id, { saving: false });
    }
  }

  // ── COMPLETE ORDER ─────────────────────────────────────────────────────────

  async function completeOrder() {
    setCompleting(true);
    setCompleteError('');
    try {
      const res = await adminFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'fulfilled' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to complete order');
      }
      onComplete();
    } catch (e) {
      setCompleteError(e instanceof Error ? e.message : 'Something went wrong');
      setShowConfirm(false);
    } finally {
      setCompleting(false);
    }
  }

  // ── GROUP ITEMS ────────────────────────────────────────────────────────────

  // Split into pending and done sections; substitutions travel with their parent category
  const pendingItems = items.filter(i => {
    if (i.is_substitution) return false;
    return i.shopping_status === 'pending';
  });

  const doneItems = items.filter(i => {
    if (i.is_substitution) return false;
    return i.shopping_status !== 'pending';
  });

  // Attach substitution children to their parents for rendering
  const subsByParent = items
    .filter(i => i.is_substitution)
    .reduce((acc, i) => {
      const key = i.substitutes_item_id || '';
      if (!acc[key]) acc[key] = [];
      acc[key].push(i);
      return acc;
    }, {} as Record<string, OrderItem[]>);

  // ── Group pending items for shopping ──
  // By Aisle: store walking order (zones → aisles ascending → no-location last)
  // By Category: alphabetical product categories (fallback when locations are sparse)
  const anyLocated = pendingItems.some(i => (i.location || '').trim());
  const effectiveView = anyLocated ? viewMode : 'category';
  const pendingGroups = effectiveView === 'aisle'
    ? groupByWalkingOrder(pendingItems, zoneOrder)
    : Array.from(
        pendingItems.reduce((acc, i) => {
          const key = i.category || 'General';
          if (!acc.has(key)) acc.set(key, [] as OrderItem[]);
          acc.get(key)!.push(i);
          return acc;
        }, new Map<string, OrderItem[]>()).entries()
      )
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, groupItems]) => ({ key: `cat-${label}`, label, items: groupItems }));

  // IDs of substitution items currently flashing saved
  const subSavedFlash = new Set(
    Object.entries(itemUi)
      .filter(([, v]) => v.justSaved)
      .map(([k]) => k)
  );

  // Remaining item names for bottom bar hint
  const remainingNames = pendingItems.slice(0, 3).map(i =>
    i.description.length > 28 ? i.description.slice(0, 26) + '…' : i.description
  );
  const extraPending = Math.max(0, pendingItems.length - 3);

  // ── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="fixed inset-0 z-[70] flex flex-col bg-gray-50">

        {/* ── TOP BAR ── */}
        <div className="bg-brand-navy px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            <p className="text-brand-sky text-xs uppercase tracking-wide">Shopping Mode</p>
            <h2 className="text-white font-display text-lg font-bold">{order.order_number}</h2>
            {order.company_name && (
              <p className="text-brand-sky/70 text-xs">{order.company_name}</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-brand-gold text-xs uppercase tracking-wide">Progress</p>
              <p className="text-white font-bold text-sm">
                {processed.length}
                <span className="text-brand-sky font-normal"> / {originals.length}</span>
              </p>
            </div>
            <button onClick={onClose} className="text-brand-sky hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* ── PROGRESS BAR ── */}
        <div className="h-1.5 bg-brand-navy/20 shrink-0">
          <div
            className={`h-full transition-all duration-500 ${allDone ? 'bg-brand-green' : 'bg-brand-gold'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* ── VIEW TOGGLE — walk the store in order vs. browse by category ── */}
        {pendingItems.length > 0 && (
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('aisle')}
                disabled={!anyLocated}
                title={anyLocated ? 'Group items in store-walking order' : 'No items on this order have a location yet'}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-colors ${
                  effectiveView === 'aisle' ? 'bg-brand-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                } disabled:opacity-40`}
              >
                <MapPin className="w-3.5 h-3.5" /> By Aisle
              </button>
              <button
                type="button"
                onClick={() => setViewMode('category')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border-l border-gray-200 transition-colors ${
                  effectiveView === 'category' ? 'bg-brand-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <List className="w-3.5 h-3.5" /> By Category
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              {effectiveView === 'aisle'
                ? `${pendingGroups.length} stop${pendingGroups.length !== 1 ? 's' : ''} through the store`
                : `${pendingGroups.length} categor${pendingGroups.length !== 1 ? 'ies' : 'y'}`}
            </p>
          </div>
        )}

        {/* ── ITEM LIST ── */}
        <div className="flex-1 overflow-y-auto pb-36 relative">
          {loadingFresh && (
            <div className="absolute inset-0 bg-gray-50/80 z-10 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-brand-navy" />
              <p className="text-sm text-gray-500 font-medium">Loading saved progress…</p>
            </div>
          )}

          {/* PENDING SECTION — grouped in store-walking order (or by category) */}
          {pendingItems.length > 0 && (
            <div className="px-4 pt-3">
              <div className="flex items-center gap-2 py-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-widest text-amber-600">
                  Needs Action ({pendingItems.length})
                </span>
              </div>
              {pendingGroups.map((group, gi) => {
                const isNoLocation = group.label === NO_LOCATION_LABEL;
                return (
                  <div key={group.key} className="pb-1">
                    {/* Sticky group header — always know which aisle you're in */}
                    <div className="sticky top-0 z-[5] -mx-4 px-4 py-1.5 bg-gray-50/95 backdrop-blur-sm">
                      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                        isNoLocation
                          ? 'bg-gray-100 border border-dashed border-gray-300'
                          : 'bg-teal-50 border border-teal-200'
                      }`}>
                        <MapPin className={`w-4 h-4 shrink-0 ${isNoLocation ? 'text-gray-400' : 'text-teal-600'}`} />
                        <span className={`text-sm font-bold ${isNoLocation ? 'text-gray-500' : 'text-teal-800'}`}>
                          {group.label}
                        </span>
                        <span className={`text-xs ${isNoLocation ? 'text-gray-400' : 'text-teal-600'}`}>
                          {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                        </span>
                        {effectiveView === 'aisle' && !isNoLocation && (
                          <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-teal-500">
                            Stop {gi + 1} of {pendingGroups.length}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 pt-1.5">
                      {group.items.map(item => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          ui={itemUi[item.id] || defaultItemUiState()}
                          substitutions={subsByParent[item.id] || []}
                          subSavedIds={subSavedFlash}
                          onRetry={() => {
                            setUi(item.id, { saveError: '' });
                            markShopped(item);
                          }}
                          onShopped={() => markShopped(item)}
                          onOpenWeight={() => setUi(item.id, { uiState: 'weight_entry' })}
                          onWeightChange={v => setUi(item.id, { weightInput: v })}
                          onConfirmWeight={() => confirmWeight(item)}
                          onCancelWeight={() => setUi(item.id, { uiState: 'idle', weightInput: '' })}
                          onOpenSub={() => setUi(item.id, { uiState: 'sub_search' })}
                          onSubSearch={q => {
                            setUi(item.id, { subSearch: q, subSelected: null });
                            searchProducts(item.id, q);
                          }}
                          onSubSelect={p => setUi(item.id, { subSelected: p, subResults: [] })}
                          onSubQtyChange={v => setUi(item.id, { subQty: v })}
                          onConfirmSub={() => confirmSubstitution(item)}
                          onCancelSub={() => setUi(item.id, { uiState: 'idle', subSearch: '', subSelected: null, subResults: [] })}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* DONE SECTION */}
          {doneItems.length > 0 && (
            <div className="px-4 pt-5 pb-2 space-y-2">
              <div className="flex items-center gap-2 py-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-green" />
                <span className="text-xs font-bold uppercase tracking-widest text-brand-green/70">
                  Done ({doneItems.length})
                </span>
              </div>
              {doneItems.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  ui={itemUi[item.id] || defaultItemUiState()}
                  substitutions={subsByParent[item.id] || []}
                  subSavedIds={subSavedFlash}
                  onRetry={() => {
                    setUi(item.id, { saveError: '' });
                    markShopped(item);
                  }}
                  onShopped={() => markShopped(item)}
                  onOpenWeight={() => setUi(item.id, { uiState: 'weight_entry' })}
                  onWeightChange={v => setUi(item.id, { weightInput: v })}
                  onConfirmWeight={() => confirmWeight(item)}
                  onCancelWeight={() => setUi(item.id, { uiState: 'idle', weightInput: '' })}
                  onOpenSub={() => setUi(item.id, { uiState: 'sub_search' })}
                  onSubSearch={q => {
                    setUi(item.id, { subSearch: q, subSelected: null });
                    searchProducts(item.id, q);
                  }}
                  onSubSelect={p => setUi(item.id, { subSelected: p, subResults: [] })}
                  onSubQtyChange={v => setUi(item.id, { subQty: v })}
                  onConfirmSub={() => confirmSubstitution(item)}
                  onCancelSub={() => setUi(item.id, { uiState: 'idle', subSearch: '', subSelected: null, subResults: [] })}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <ShoppingCart className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No items in this order</p>
            </div>
          )}
        </div>

        {/* ── BOTTOM BAR ── */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 space-y-2 shadow-lg">
          {completeError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {completeError}
            </div>
          )}

          {!allDone ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-600">
                {pendingItems.length} item{pendingItems.length !== 1 ? 's' : ''} still need{pendingItems.length === 1 ? 's' : ''} action:
              </p>
              <p className="text-xs text-gray-400 truncate">
                {remainingNames.join(', ')}{extraPending > 0 ? ` +${extraPending} more` : ''}
              </p>
            </div>
          ) : (
            <p className="text-xs text-brand-green font-semibold text-center">
              ✓ All items processed — ready to complete
            </p>
          )}

          <button
            onClick={() => setShowConfirm(true)}
            className={`w-full py-3.5 rounded-xl font-display font-bold text-base uppercase tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg ${
              allDone
                ? 'bg-brand-green text-white hover:bg-brand-gmed'
                : 'bg-brand-navy text-white hover:bg-brand-steel'
            }`}
          >
            <CheckCircle2 className="w-5 h-5" />
            Complete Order
          </button>
        </div>
      </div>

      {/* ── CONFIRMATION DIALOG ── */}
      {showConfirm && (
        <ConfirmCompleteDialog
          customerEmail={order.customer_email}
          pendingItems={pendingItems}
          onConfirm={completeOrder}
          onCancel={() => setShowConfirm(false)}
          completing={completing}
        />
      )}
    </>
  );
}

// ── ITEM ROW ──────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: OrderItem;
  ui: ItemUiState;
  substitutions: OrderItem[]; // subs that replaced this item
  subSavedIds: Set<string>; // which sub IDs are flashing saved
  onRetry: () => void;  // retry last failed save
  onShopped: () => void;
  onOpenWeight: () => void;
  onWeightChange: (v: string) => void;
  onConfirmWeight: () => void;
  onCancelWeight: () => void;
  onOpenSub: () => void;
  onSubSearch: (q: string) => void;
  onSubSelect: (p: Product) => void;
  onSubQtyChange: (v: string) => void;
  onConfirmSub: () => void;
  onCancelSub: () => void;
}

function ItemRow({
  item, ui, substitutions, subSavedIds,
  onRetry, onShopped, onOpenWeight, onWeightChange, onConfirmWeight, onCancelWeight,
  onOpenSub, onSubSearch, onSubSelect, onSubQtyChange, onConfirmSub, onCancelSub,
}: ItemRowProps) {
  const shopped = item.shopping_status === 'shopped';
  const outOfStock = item.shopping_status === 'out_of_stock';
  const pending = item.shopping_status === 'pending';
  const weight = isWeightItem(item);
  const effectiveTotal = item.actual_total ?? item.line_total;
  const previewWeight = parseFloat(ui.weightInput);
  const weightPreview = !isNaN(previewWeight) && previewWeight > 0
    ? previewWeight * item.unit_price
    : null;

  // Card accent classes
  let cardBorder = 'border-gray-200';
  if (pending) cardBorder = 'border-amber-300';
  if (shopped && ui.justSaved) cardBorder = 'border-green-400';
  if (outOfStock) cardBorder = 'border-gray-200';

  let cardBg = 'bg-white';
  if (ui.justSaved) cardBg = 'bg-green-50';
  if (outOfStock) cardBg = 'bg-gray-50';

  return (
    <div className={`rounded-xl border overflow-hidden transition-all duration-300 ${cardBorder} ${pending ? 'shadow-sm' : ''}`}>
      {/* ── ITEM HEADER ── */}
      <div className={`px-4 py-3 flex items-start gap-3 transition-colors duration-500 ${cardBg}`}>
        {/* Status dot */}
        <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
          shopped ? 'bg-green-100' :
          outOfStock ? 'bg-gray-200' :
          'bg-amber-100'
        }`}>
          {shopped
            ? <Check className="w-3.5 h-3.5 text-green-600" />
            : outOfStock
            ? <PackageX className="w-3.5 h-3.5 text-gray-400" />
            : <div className="w-2 h-2 rounded-full bg-amber-500" />
          }
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {outOfStock && (
                <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded mr-1.5 mb-1">
                  Out of Stock
                </span>
              )}
              {ui.justSaved && !outOfStock && (
                <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-green-700 bg-green-100 px-1.5 py-0.5 rounded mr-1.5 mb-1">
                  ✓ Saved
                </span>
              )}
              <p className={`text-sm font-bold leading-snug ${outOfStock ? 'line-through text-gray-400' : 'text-brand-navy'}`}>
                {item.description}
              </p>
              {item.location && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5 mt-0.5 mb-0.5 mr-1">
                  📍 {item.location}
                </span>
              )}
              {item.paid_by === 'cod' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5 mt-0.5 mb-0.5"
                  title="Crew member pays at delivery — ring up separately, not on the company invoice">
                  $ COD{item.cod_name ? ` — ${item.cod_name}` : ''} · ring separately
                </span>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {item.upc && <span className="font-mono mr-2">{item.upc}</span>}
                Qty: <strong>{item.quantity}</strong>
                {item.pkg_size && <span className="ml-1">· {item.pkg_size}</span>}
                {weight && (
                  <span className="ml-1.5 text-brand-orange font-semibold">· By Weight (LB)</span>
                )}
              </p>
              {item.actual_weight != null && (
                <p className="text-xs text-green-700 font-semibold mt-0.5">
                  Actual: {item.actual_weight} lbs → {formatCurrency(effectiveTotal)}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-gray-400">{formatCurrency(item.unit_price)}{weight ? '/lb' : ''}</p>
              <p className={`text-sm font-bold ${outOfStock ? 'text-gray-300 line-through' : 'text-brand-navy'}`}>
                {formatCurrency(effectiveTotal)}
              </p>
            </div>
          </div>

          {/* Save error banner */}
          {ui.saveError && (
            <div className="mt-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <p className="text-xs text-red-600 flex-1">{ui.saveError}</p>
              <button
                onClick={onRetry}
                className="text-xs font-bold text-red-600 hover:text-red-800 underline shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Action buttons — pending, non-sub items only */}
          {!item.is_substitution && pending && ui.uiState === 'idle' && (
            <div className="flex gap-2 mt-3 flex-wrap">
              <button
                onClick={onShopped}
                disabled={ui.saving}
                className="flex items-center gap-1.5 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {ui.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Shopped
              </button>
              <button
                onClick={onOpenWeight}
                className="flex items-center gap-1.5 bg-brand-orange text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-orange-700 transition-colors"
              >
                <Scale className="w-3 h-3" />
                {weight ? 'Enter Weight' : 'By Weight'}
              </button>
              <button
                onClick={onOpenSub}
                className="flex items-center gap-1.5 bg-gray-200 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-gray-300 transition-colors"
              >
                <PackageX className="w-3 h-3" /> Out of Stock
              </button>
            </div>
          )}

          {/* Substitution children — shown inline under their parent */}
          {substitutions.length > 0 && (
            <div className="mt-3 space-y-1.5 pl-2 border-l-2 border-brand-orange/30">
              {substitutions.map(sub => (
                <div key={sub.id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors duration-500 ${
                  subSavedIds.has(sub.id) ? 'bg-green-100' : 'bg-brand-orange/5'
                }`}>
                  <div>
                    <span className="inline-block text-[9px] font-bold uppercase tracking-wide text-brand-orange bg-brand-orange/10 px-1 py-0.5 rounded mr-1">
                      Sub
                    </span>
                    <span className="text-xs font-semibold text-brand-navy">{sub.description}</span>
                    <span className="text-xs text-gray-400 ml-1.5">× {sub.quantity}</span>
                  </div>
                  <span className="text-xs font-bold text-brand-navy shrink-0">
                    {formatCurrency(sub.line_total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── WEIGHT ENTRY ── */}
      {ui.uiState === 'weight_entry' && (
        <div className="border-t border-brand-orange/20 bg-orange-50 px-4 py-3 space-y-2">
          <p className="text-xs font-bold text-brand-orange uppercase tracking-wide">Enter Actual Weight</p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input-base pr-12 text-lg font-bold"
                placeholder="0.00"
                value={ui.weightInput}
                onChange={e => onWeightChange(e.target.value)}
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">lbs</span>
            </div>
            {weightPreview !== null && (
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-500">Total</p>
                <p className="text-base font-bold text-brand-green">{formatCurrency(weightPreview)}</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onConfirmWeight}
              disabled={ui.saving || !parseFloat(ui.weightInput)}
              className="flex-1 bg-brand-orange text-white text-sm font-bold py-2.5 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {ui.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Confirm Weight
            </button>
            <button onClick={onCancelWeight} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── SUBSTITUTION SEARCH ── */}
      {ui.uiState === 'sub_search' && (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Select Replacement Product</p>
          {!ui.subSelected ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  className="input-base pl-9"
                  placeholder="Search products…"
                  value={ui.subSearch}
                  onChange={e => onSubSearch(e.target.value)}
                  autoFocus
                />
                {ui.subSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                )}
              </div>
              {ui.subResults.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto bg-white">
                  {ui.subResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => onSubSelect(p)}
                      className="w-full text-left px-3 py-2 hover:bg-brand-sand/40 border-b border-gray-100 last:border-0 flex items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-brand-navy">{p.description}</p>
                        <p className="text-xs text-gray-400">{p.category}{p.pkg_size && ` · ${p.pkg_size}`}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-brand-green">{formatCurrency(p.price)}</p>
                        <p className="text-xs text-gray-400">{p.uom || 'EACH'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="bg-white rounded-lg border border-brand-green/30 px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-brand-navy">{ui.subSelected.description}</p>
                  <p className="text-xs text-gray-400">
                    {ui.subSelected.category} · {formatCurrency(ui.subSelected.price)}/{ui.subSelected.uom || 'EACH'}
                  </p>
                </div>
                <button
                  onClick={() => onSubSelect(null as unknown as Product)}
                  className="text-gray-400 hover:text-gray-600 text-xs underline ml-2"
                >
                  Change
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-gray-600 shrink-0">Quantity</label>
                <input
                  type="number"
                  min="1"
                  className="input-base w-24 text-center font-bold"
                  value={ui.subQty}
                  onChange={e => onSubQtyChange(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  = {formatCurrency(ui.subSelected.price * (parseInt(ui.subQty) || 1))}
                </p>
              </div>
            </>
          )}
          <div className="flex gap-2">
            <button
              onClick={onConfirmSub}
              disabled={ui.saving || !ui.subSelected}
              className="flex-1 bg-brand-navy text-white text-sm font-bold py-2.5 rounded-lg hover:bg-brand-green transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {ui.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              Confirm Substitution
            </button>
            <button onClick={onCancelSub} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
