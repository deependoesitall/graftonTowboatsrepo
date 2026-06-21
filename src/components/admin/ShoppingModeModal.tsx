'use client';
// src/components/admin/ShoppingModeModal.tsx
// Phase 2a: Full-screen shopping mode for staff to process an order item by item.

import { useState, useEffect, useCallback } from 'react';
import {
  X, Check, PackageX, Scale, Search, ShoppingCart,
  ChevronRight, Loader2, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { Order, OrderItem, Product } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-auth';

interface ShoppingModeModalProps {
  order: Order;
  onClose: () => void;
  onComplete: () => void; // called after order is marked fulfilled
}

type ItemAction = 'shopped' | 'out_of_stock' | 'set_weight' | null;
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
});

/** True for items sold by weight (LB). */
function isWeightItem(item: OrderItem) {
  return item.uom?.toUpperCase() === 'LB';
}

export function ShoppingModeModal({ order, onClose, onComplete }: ShoppingModeModalProps) {
  // Local copy of items — updates as staff processes each one
  const [items, setItems] = useState<OrderItem[]>(order.items);
  const [itemUi, setItemUi] = useState<Record<string, ItemUiState>>(() =>
    Object.fromEntries(order.items.map(i => [i.id, defaultItemUiState()]))
  );
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');

  // Original items only (not substitutions). Substitutions start as 'shopped'.
  const originals = items.filter(i => !i.is_substitution);
  const pending = originals.filter(i => i.shopping_status === 'pending');
  const processed = originals.filter(i => i.shopping_status !== 'pending');
  const allDone = pending.length === 0;

  // ── helpers ────────────────────────────────────────────────────────────────

  function setUi(itemId: string, patch: Partial<ItemUiState>) {
    setItemUi(prev => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  function updateItem(updated: OrderItem) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return prev;
    });
  }

  function addItem(newItem: OrderItem) {
    setItemUi(prev => ({ ...prev, [newItem.id]: defaultItemUiState() }));
    setItems(prev => [...prev, newItem]);
  }

  // ── SHOPPED ────────────────────────────────────────────────────────────────

  async function markShopped(item: OrderItem) {
    setUi(item.id, { saving: true });
    try {
      const res = await adminFetch(`/api/orders/${order.id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'shopped' }),
      });
      if (!res.ok) throw new Error('Failed');
      const { item: updated } = await res.json();
      updateItem(updated);
    } catch {
      // silent — let staff retry
    } finally {
      setUi(item.id, { saving: false });
    }
  }

  // ── SET WEIGHT ─────────────────────────────────────────────────────────────

  async function confirmWeight(item: OrderItem) {
    const weight = parseFloat(itemUi[item.id]?.weightInput || '');
    if (!weight || weight <= 0) return;
    setUi(item.id, { saving: true });
    try {
      const res = await adminFetch(`/api/orders/${order.id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_weight', actual_weight: weight }),
      });
      if (!res.ok) throw new Error('Failed');
      const { item: updated } = await res.json();
      updateItem(updated);
      setUi(item.id, { uiState: 'idle' });
    } catch {
      // silent
    } finally {
      setUi(item.id, { saving: false });
    }
  }

  // ── SUBSTITUTION SEARCH ────────────────────────────────────────────────────

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
    setUi(item.id, { saving: true });
    try {
      const res = await adminFetch(`/api/orders/${order.id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'out_of_stock',
          substitution: { product_id: ui.subSelected.id, quantity: qty },
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const { item: updated, substitution } = await res.json();
      updateItem(updated);
      if (substitution) addItem(substitution);
      setUi(item.id, { uiState: 'idle', subSelected: null, subSearch: '', subResults: [] });
    } catch {
      // silent
    } finally {
      setUi(item.id, { saving: false });
    }
  }

  // ── COMPLETE ORDER ─────────────────────────────────────────────────────────

  async function completeOrder() {
    if (!allDone) return;
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
    } finally {
      setCompleting(false);
    }
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────

  // Group visible items by category (substitutions appear under the same category as their replacement product)
  const grouped = items.reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, OrderItem[]>);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-50">
      {/* ── TOP BAR ── */}
      <div className="bg-brand-navy px-4 py-3 flex items-center justify-between shrink-0">
        <div>
          <p className="text-brand-sky text-xs uppercase tracking-wide">Shopping Mode</p>
          <h2 className="text-white font-display text-lg font-bold">{order.order_number}</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-brand-gold text-xs uppercase tracking-wide">Progress</p>
            <p className="text-white font-bold text-sm">
              {processed.length} / {originals.length}
              <span className="text-brand-sky font-normal text-xs ml-1">items</span>
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
          className="h-full bg-brand-gold transition-all duration-500"
          style={{ width: originals.length ? `${(processed.length / originals.length) * 100}%` : '0%' }}
        />
      </div>

      {/* ── ITEM LIST ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 pb-36">
        {Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat}>
            <div className="text-xs font-bold uppercase tracking-widest text-brand-green/60 py-2 px-1 sticky top-0 bg-gray-50">
              {cat}
            </div>
            <div className="space-y-2">
              {catItems.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  ui={itemUi[item.id] || defaultItemUiState()}
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
                  substitutedOriginal={
                    item.is_substitution
                      ? items.find(i => i.id === item.substitutes_item_id)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── BOTTOM BAR ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 space-y-2">
        {completeError && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {completeError}
          </div>
        )}
        {!allDone && (
          <p className="text-xs text-gray-400 text-center">
            {pending.length} item{pending.length !== 1 ? 's' : ''} still need{pending.length === 1 ? 's' : ''} to be processed
          </p>
        )}
        <button
          onClick={completeOrder}
          disabled={!allDone || completing}
          className={`w-full py-3.5 rounded-xl font-display font-bold text-base uppercase tracking-wide flex items-center justify-center gap-2 transition-all ${
            allDone
              ? 'bg-brand-green text-white hover:bg-brand-gmed shadow-lg'
              : 'bg-gray-100 text-gray-300 cursor-not-allowed'
          }`}
        >
          {completing
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Completing…</>
            : allDone
            ? <><CheckCircle2 className="w-5 h-5" /> Complete Order</>
            : <><ShoppingCart className="w-5 h-5" /> Complete Order</>
          }
        </button>
      </div>
    </div>
  );
}

// ── ITEM ROW ──────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: OrderItem;
  ui: ItemUiState;
  substitutedOriginal?: OrderItem;
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
  item, ui, substitutedOriginal,
  onShopped, onOpenWeight, onWeightChange, onConfirmWeight, onCancelWeight,
  onOpenSub, onSubSearch, onSubSelect, onSubQtyChange, onConfirmSub, onCancelSub,
}: ItemRowProps) {
  const shopped = item.shopping_status === 'shopped';
  const outOfStock = item.shopping_status === 'out_of_stock';
  const weight = isWeightItem(item);

  const effectiveTotal = item.actual_total ?? item.line_total;
  const previewWeight = parseFloat(ui.weightInput);
  const weightPreview = !isNaN(previewWeight) && previewWeight > 0
    ? previewWeight * item.unit_price * item.quantity
    : null;

  return (
    <div className={`card-base overflow-hidden transition-all ${
      outOfStock ? 'opacity-50' : ''
    }`}>
      {/* Item header */}
      <div className={`px-4 py-3 flex items-start gap-3 ${
        shopped ? 'bg-green-50' : outOfStock ? 'bg-gray-50' : 'bg-white'
      }`}>
        {/* Status icon */}
        <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
          shopped ? 'bg-green-100' : outOfStock ? 'bg-gray-200' : 'bg-brand-sand'
        }`}>
          {shopped ? <Check className="w-3.5 h-3.5 text-green-600" /> :
           outOfStock ? <PackageX className="w-3.5 h-3.5 text-gray-400" /> :
           <div className="w-2 h-2 rounded-full bg-brand-gold" />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              {item.is_substitution && (
                <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-brand-orange bg-brand-orange/10 px-1.5 py-0.5 rounded mr-1.5 mb-1">
                  Substitution
                </span>
              )}
              {outOfStock && (
                <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded mr-1.5 mb-1">
                  Out of Stock
                </span>
              )}
              <p className={`text-sm font-bold ${outOfStock ? 'line-through text-gray-400' : 'text-brand-navy'}`}>
                {item.description}
              </p>
              {item.is_substitution && substitutedOriginal && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Replaces: {substitutedOriginal.description}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {item.upc && <span className="font-mono mr-2">{item.upc}</span>}
                Qty: <strong>{item.quantity}</strong>
                {item.pkg_size && <span className="ml-1">· {item.pkg_size}</span>}
                {weight && <span className="ml-1">· <strong className="text-brand-orange">By Weight (LB)</strong></span>}
              </p>
              {item.actual_weight && (
                <p className="text-xs text-green-700 font-semibold mt-0.5">
                  Actual: {item.actual_weight} lbs → {formatCurrency(effectiveTotal)}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-gray-400">{formatCurrency(item.unit_price)}{weight ? '/lb' : ''}</p>
              <p className="text-sm font-bold text-brand-navy">{formatCurrency(effectiveTotal)}</p>
            </div>
          </div>

          {/* Action buttons — only for non-substitution, pending items */}
          {!item.is_substitution && item.shopping_status === 'pending' && ui.uiState === 'idle' && (
            <div className="flex gap-2 mt-3 flex-wrap">
              <button
                onClick={onShopped}
                disabled={ui.saving}
                className="flex items-center gap-1.5 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {ui.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Shopped
              </button>
              {weight && (
                <button
                  onClick={onOpenWeight}
                  className="flex items-center gap-1.5 bg-brand-orange text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <Scale className="w-3 h-3" /> Enter Weight
                </button>
              )}
              <button
                onClick={onOpenSub}
                className="flex items-center gap-1.5 bg-gray-200 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-gray-300 transition-colors"
              >
                <PackageX className="w-3 h-3" /> Out of Stock
              </button>
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
              className="flex-1 bg-brand-orange text-white text-sm font-bold py-2 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
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
                  <p className="text-xs text-gray-400">{ui.subSelected.category} · {formatCurrency(ui.subSelected.price)}/{ui.subSelected.uom || 'EACH'}</p>
                </div>
                <button onClick={() => onSubSelect(null as unknown as Product)} className="text-gray-400 hover:text-gray-600 text-xs underline ml-2">
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
              className="flex-1 bg-brand-navy text-white text-sm font-bold py-2 rounded-lg hover:bg-brand-green transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
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
