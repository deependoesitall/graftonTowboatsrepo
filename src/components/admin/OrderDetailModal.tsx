'use client';
// src/components/admin/OrderDetailModal.tsx

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Download, FileText, Printer, Trash2, Loader2, ShoppingCart,
  Ship, MapPin, Users, Package, Wrench, CheckCircle2, Eye,
  Pencil, Plus, Search, Check, Receipt, FileSignature,
} from 'lucide-react';
import { Order, OrderItem, OrderStatus, Product } from '@/types';
import { formatCurrency, formatDate, ORDER_STATUSES } from '@/lib/utils';
import { ShoppingModeModal } from '@/components/admin/ShoppingModeModal';
import { adminFetch } from '@/lib/admin-auth';
import { PickSheetOverlay } from '@/components/admin/PickSheetOverlay';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface OrderDetailModalProps {
  order: Order;
  onClose: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onDownloadPdf: () => void;
  onDelete?: () => void;
  onRefresh: () => void;
  canEdit?: boolean;
  isOwner?: boolean;
  deleting?: boolean;
}

export function OrderDetailModal({
  order, onClose, onStatusChange, onDownloadPdf,
  onDelete, onRefresh, canEdit = true, isOwner = false, deleting = false,
}: OrderDetailModalProps) {
  const [shoppingMode, setShoppingMode] = useState(false);
  const [markingFulfilled, setMarkingFulfilled] = useState(false);
  const [showPickSheet, setShowPickSheet] = useState(false);
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();

  // ── Billing documents (owner): Sinclair's receipt + signed Ingram slip ──
  const [docReceipt, setDocReceipt] = useState<string | null>(order.sinclairs_receipt_url ?? null);
  const [docSlip, setDocSlip] = useState<string | null>(order.ingram_slip_url ?? null);
  const [docUploading, setDocUploading] = useState<'receipt' | 'slip' | null>(null);

  async function uploadDoc(kind: 'receipt' | 'slip', file: File) {
    setDocUploading(kind);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await adminFetch(`/api/orders/${order.id}/documents`, { method: 'POST', body: fd });
      if (res.ok) {
        const r = await res.json();
        if (kind === 'receipt') setDocReceipt(r.url); else setDocSlip(r.url);
      }
    } finally {
      setDocUploading(null);
    }
  }

  // Barcode pick sheet — Freshop-style printout with scannable UPC-A codes,
  // shown IN-APP (no pop-up windows). Opening it on a NEW order prompts to
  // lock it (Dave: "if I print it, it needs to be in progress" — but he also
  // prints future orders early, so it's a choice).
  async function handlePrintPickSheet() {
    if (canEdit && order.status === 'new') {
      const choice = await confirmDialog({
        title: 'Mark as In Progress before printing?',
        message: 'In Progress locks the order — the customer can no longer add or change items. Printing early for a future-day order? Choose Just Print and the customer can keep editing.',
        actions: [
          { id: 'lock', label: 'Mark In Progress & Print' },
          { id: 'print', label: 'Just Print', variant: 'neutral' },
        ],
      });
      if (!choice) return;
      if (choice === 'lock') onStatusChange('in_progress');
    }
    setShowPickSheet(true);
  }

  // ── Local item state (so edits reflect immediately without closing modal) ──
  const [localItems, setLocalItems] = useState<OrderItem[]>(order.items);
  const [localSubtotal, setLocalSubtotal] = useState(order.subtotal);

  // ── Register total — actual amount Sinclair's rang at the register ──
  const [registerTotal, setRegisterTotal] = useState<string>(
    order.register_total != null ? String(order.register_total) : ''
  );
  const [registerTotalSaving, setRegisterTotalSaving] = useState(false);

  async function saveRegisterTotal(raw: string) {
    const val = raw.trim() === '' ? null : parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (raw.trim() !== '' && (isNaN(val!) || val! < 0)) return;
    setRegisterTotalSaving(true);
    try {
      await adminFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ register_total: val }),
      });
    } finally {
      setRegisterTotalSaving(false);
    }
  }

  // Edit quantity inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Delete item
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // Add item panel
  const [addingItem, setAddingItem] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState<Product[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  const [addSelected, setAddSelected] = useState<Product | null>(null);
  const [addQty, setAddQty] = useState('1');
  const [addSaving, setAddSaving] = useState(false);
  const [itemError, setItemError] = useState('');

  const groceryItems = localItems.filter(i => i.item_type !== 'service');
  const serviceItems = localItems.filter(i => i.item_type === 'service');
  const subtotal = groceryItems
    .filter(i => i.shopping_status !== 'out_of_stock')
    .reduce((s, i) => s + (i.actual_total ?? i.unit_price * i.quantity), 0);
  const codItems = groceryItems.filter(i => i.paid_by === 'cod');
  const codSubtotal = codItems
    .filter(i => i.shopping_status !== 'out_of_stock')
    .reduce((s, i) => s + (i.actual_total ?? i.unit_price * i.quantity), 0);
  // Deck lines — company-billed but listed separately from the grocery allowance
  const deckItems = groceryItems.filter(i => i.paid_by === 'deck');
  const deckSubtotal = deckItems
    .filter(i => i.shopping_status !== 'out_of_stock')
    .reduce((s, i) => s + (i.actual_total ?? i.unit_price * i.quantity), 0);
  const codMethodLabel = order.cod_payment_method === 'credit_card' ? 'Credit Card — call to collect'
    : order.cod_payment_method === 'venmo' ? 'Venmo — send a payment request'
    : order.cod_payment_method === 'cashapp' ? 'Cash App — send a payment request'
    : order.cod_payment_method === 'cash' ? 'Cash (legacy)' : null;

  // COD handling fee — defaults to 5%, editable per order (big-ticket externals
  // may warrant more or less; Dave: "default 5%, but we can edit it ourselves").
  const [feePct, setFeePct] = useState<string>(String(order.cod_fee_percent ?? 5));
  const [savingFee, setSavingFee] = useState(false);
  const feeNum = Math.max(0, parseFloat(feePct) || 0);
  async function saveFee() {
    setSavingFee(true);
    try {
      await adminFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cod_fee_percent: feeNum }),
      });
      onRefresh();
    } finally {
      setSavingFee(false);
    }
  }

  const ext = order.extended_info;

  const deliveryMethodLabel = order.delivery_method === 'boat' ? 'Boat Delivery'
    : order.delivery_method === 'van' ? 'Van Delivery' : null;
  const approachLabel = order.approach_side
    ? order.approach_side.charAt(0).toUpperCase() + order.approach_side.slice(1)
    : null;

  // ── Product search for Add Item ───────────────────────────────────────────
  const searchProducts = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setAddResults([]); return; }
    setAddSearching(true);
    try {
      const res = await adminFetch(`/api/products?search=${encodeURIComponent(q)}&status=active&per_page=12`);
      const { products } = await res.json();
      setAddResults(products || []);
    } finally {
      setAddSearching(false);
    }
  }, []);

  // ── Save quantity edit ────────────────────────────────────────────────────
  async function saveQty(item: OrderItem) {
    // Decimals allowed — by-weight items are quantified in pounds (½ lb, etc.)
    const qty = parseFloat(editQty);
    if (!qty || qty <= 0) return;
    setEditSaving(true);
    setItemError('');
    try {
      const res = await adminFetch(`/api/orders/${order.id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_quantity', quantity: qty }),
      });
      if (!res.ok) throw new Error('Failed to update');
      const { item: updated } = await res.json();
      setLocalItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      onRefresh();
    } catch {
      setItemError('Failed to save — please try again');
    } finally {
      setEditSaving(false);
      setEditingId(null);
    }
  }

  // ── Delete item ───────────────────────────────────────────────────────────
  async function deleteItem(itemId: string) {
    if (!(await confirmDialog({ title: 'Remove this item from the order?', danger: true }))) return;
    setDeletingItemId(itemId);
    setItemError('');
    try {
      const res = await adminFetch(`/api/orders/${order.id}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      setLocalItems(prev => prev.filter(i => i.id !== itemId && i.substitutes_item_id !== itemId));
      onRefresh();
    } catch {
      setItemError('Failed to remove item — please try again');
    } finally {
      setDeletingItemId(null);
    }
  }

  // ── Add item ──────────────────────────────────────────────────────────────
  async function confirmAdd() {
    if (!addSelected) return;
    const qty = parseInt(addQty) || 1;
    setAddSaving(true);
    setItemError('');
    try {
      const res = await adminFetch(`/api/orders/${order.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: addSelected.id, quantity: qty }),
      });
      if (!res.ok) throw new Error('Failed to add item');
      const { item } = await res.json();
      setLocalItems(prev => [...prev, item]);
      setAddingItem(false);
      setAddSearch('');
      setAddResults([]);
      setAddSelected(null);
      setAddQty('1');
      onRefresh();
    } catch {
      setItemError('Failed to add item — please try again');
    } finally {
      setAddSaving(false);
    }
  }

  function cancelAdd() {
    setAddingItem(false);
    setAddSearch('');
    setAddResults([]);
    setAddSelected(null);
    setAddQty('1');
    setItemError('');
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl animate-fade-in">

          {/* Header */}
          <div className="bg-brand-navy px-6 py-4 rounded-t-xl flex items-center justify-between">
            <div>
              <p className="text-brand-sky text-xs uppercase tracking-wide">Order Details</p>
              <h2 className="text-white font-display text-xl font-bold">{order.order_number}</h2>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handlePrintPickSheet}
                className="text-brand-gold hover:text-brand-amber transition-colors"
                title="Print Pick Sheet (barcodes)">
                <Printer className="w-5 h-5" />
              </button>
              <button onClick={onDownloadPdf} className="text-brand-gold hover:text-brand-amber transition-colors" title="View PDF">
                <Eye className="w-5 h-5" />
              </button>
              <button onClick={onDownloadPdf} className="text-brand-gold hover:text-brand-amber transition-colors" title="Download PDF">
                <Download className="w-5 h-5" />
              </button>
              {isOwner && onDelete && (
                <button onClick={onDelete} disabled={deleting}
                  className="text-brand-sky hover:text-red-400 transition-colors disabled:opacity-50" title="Delete Order">
                  {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                </button>
              )}
              <button onClick={onClose} className="text-brand-sky hover:text-white transition-colors ml-2">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-5">

            {/* Company / Billing */}
            <Section icon={<FileText className="w-3.5 h-3.5" />} title="Company &amp; Billing">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <IB label="Company" value={order.company_name} />
                <IB label="Billing Contact" value={order.contact_name} />
                <IB label="Phone" value={order.phone} />
                {order.customer_email && <IB label="Email" value={order.customer_email} />}
                {order.po_number && <IB label="PO Number" value={order.po_number} />}
                <IB label="Ordered" value={formatDate(order.created_at)} />
              </div>
            </Section>

            {/* Vessel */}
            {(order.vessel_name || order.captain_name) && (
              <Section icon={<Ship className="w-3.5 h-3.5" />} title="Vessel Information">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {order.vessel_name   && <IB label="Vessel Name"    value={order.vessel_name} />}
                  {order.vessel_type   && <IB label="Vessel Type"    value={order.vessel_type} />}
                  {order.captain_name  && <IB label="Captain"        value={order.captain_name} />}
                  {order.captain_phone && <IB label="Captain Phone"  value={order.captain_phone} />}
                  {order.vessel_email  && <IB label="Vessel Email"   value={order.vessel_email} />}
                </div>
                {ext?.order_contact_name && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Order Contact</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <IB label="Name" value={ext.order_contact_name} />
                      {ext.order_contact_title && <IB label="Title" value={ext.order_contact_title} />}
                      {ext.order_contact_phone && <IB label="Phone" value={ext.order_contact_phone} />}
                      {ext.order_contact_email && <IB label="Email" value={ext.order_contact_email} />}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* Delivery */}
            {(order.terminal_name || order.arrival_date || order.delivery_method) && (
              <Section icon={<MapPin className="w-3.5 h-3.5" />} title="Delivery Information">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {order.terminal_name && <IB label="Terminal / Location" value={order.terminal_name} highlight />}
                  {order.arrival_date  && <IB label="Arrival Date"        value={order.arrival_date}  highlight />}
                  {order.arrival_time  && <IB label="Arrival Time"        value={order.arrival_time}  highlight />}
                  {deliveryMethodLabel && <IB label="Method"              value={deliveryMethodLabel} />}
                  {approachLabel       && <IB label="Approach Side"       value={approachLabel} />}
                  {order.vhf_channel   && <IB label="VHF Channel"         value={order.vhf_channel} />}
                </div>
                {ext?.secondary_terminal_name && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Secondary Delivery</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <IB label="Terminal" value={ext.secondary_terminal_name} />
                      {ext.secondary_arrival_date && <IB label="Arrival Date" value={ext.secondary_arrival_date} />}
                      {ext.secondary_arrival_time && <IB label="Arrival Time" value={ext.secondary_arrival_time} />}
                      {ext.secondary_delivery_method && (
                        <IB label="Method" value={ext.secondary_delivery_method === 'boat' ? 'Boat Delivery' : 'Van Delivery'} />
                      )}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* Crew Change */}
            {order.crew_change === 'yes' && (
              <Section icon={<Users className="w-3.5 h-3.5" />} title="Crew Change">
                <span className="inline-block mb-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-orange-100 text-brand-orange border border-orange-200">Yes</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {order.crew_arriving  != null && <IB label="Arriving"  value={String(order.crew_arriving)} />}
                  {order.crew_departing != null && <IB label="Departing" value={String(order.crew_departing)} />}
                </div>
                {order.crew_change_notes && (
                  <p className="text-sm text-gray-600 mt-2">{order.crew_change_notes}</p>
                )}
              </Section>
            )}
            {order.crew_change === 'maybe' && (
              <Section icon={<Users className="w-3.5 h-3.5" />} title="Crew Change">
                <span className="inline-block mb-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">Maybe — to be confirmed</span>
                {order.crew_change_notes ? (
                  <p className="text-sm text-gray-600">{order.crew_change_notes}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">Customer may need a crew change — confirm before arrival.</p>
                )}
              </Section>
            )}

            {/* COD items — collected at delivery, NEVER invoiced */}
            {codItems.length > 0 && (
              <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-3">
                <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-2">
                  $ COD Items — collect {formatCurrency(codSubtotal * (1 + feeNum / 100))}{feeNum > 0 ? ` incl. ${feeNum}% fee` : ''} · separated by crew member (not on the company invoice)
                </p>
                <div className="space-y-2 mb-2">
                  {Array.from(codItems.reduce((acc, i) => {
                    const name = (i.cod_name || '').trim() || 'Crew member';
                    if (!acc.has(name)) acc.set(name, [] as typeof codItems);
                    acc.get(name)!.push(i);
                    return acc;
                  }, new Map<string, typeof codItems>()).entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([name, list]) => (
                      <div key={name} className="bg-white/60 rounded-lg px-2.5 py-1.5">
                        <p className="text-sm font-bold text-purple-800 flex justify-between">
                          <span>{name}</span>
                          <span>
                            {formatCurrency(list.reduce((s, i) => s + Number(i.actual_total ?? i.unit_price * i.quantity), 0) * (1 + feeNum / 100))}
                            {feeNum > 0 && <span className="font-normal text-purple-500 text-xs"> incl. fee</span>}
                          </span>
                        </p>
                        {list.map(i => (
                          <p key={i.id} className="text-xs text-purple-900 pl-2">
                            {i.quantity}× {i.description} · {formatCurrency(i.actual_total ?? i.unit_price * i.quantity)}
                          </p>
                        ))}
                      </div>
                    ))}
                </div>
                <div className="text-xs text-purple-800 border-t border-purple-200 pt-2 space-y-1">
                  {codMethodLabel && <p><strong>Payment method:</strong> {codMethodLabel}</p>}
                  {(order.cod_payment_method === 'venmo' || order.cod_payment_method === 'cashapp') && (
                    <p>
                      <strong>Send request to:</strong>{' '}
                      <span className="font-mono font-bold">{order.cod_payment_handle || 'no handle given — call them'}</span>
                      {' '}· never accept an inbound send — request the exact final amount
                    </p>
                  )}
                  {order.cod_payment_method === 'credit_card' && (
                    <p>
                      <strong>Call:</strong> {order.cod_preferred_phone || 'no number given'}
                      {order.cod_contact_time && <> · <strong>Best time (around):</strong> {order.cod_contact_time}</>}
                    </p>
                  )}
                  <p className="flex items-center gap-2">
                    <strong>Handling fee:</strong>
                    {canEdit ? (
                      <>
                        <input
                          type="number" min="0" max="100" step="0.5"
                          className="w-16 border border-purple-300 rounded px-1.5 py-0.5 text-center font-bold bg-white"
                          value={feePct}
                          onChange={e => setFeePct(e.target.value)}
                        />
                        <span>%</span>
                        {feeNum !== Number(order.cod_fee_percent ?? 5) && (
                          <button onClick={saveFee} disabled={savingFee}
                            className="text-[10px] font-bold uppercase bg-purple-600 text-white px-2 py-0.5 rounded hover:bg-purple-700 disabled:opacity-50">
                            {savingFee ? 'Saving…' : 'Save'}
                          </button>
                        )}
                      </>
                    ) : (
                      <span>{feeNum}%</span>
                    )}
                    <span>= {formatCurrency(codSubtotal * feeNum / 100)} on {formatCurrency(codSubtotal)}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Digital coupons applied at checkout — estimates until rung up */}
            {(order.discounts?.length ?? 0) > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-1.5">
                  🏷 Digital coupons — est. {formatCurrency(Number(order.discount_total) || 0)} savings (Sinclair&apos;s confirms at the register)
                </p>
                <div className="space-y-1">
                  {order.discounts!.map(d => (
                    <p key={d.id} className="text-sm text-green-900 flex justify-between gap-3">
                      <span>{d.name}{d.description && <span className="block text-xs text-green-700/80">{d.description}</span>}</span>
                      <span className="font-bold shrink-0">−{formatCurrency(Number(d.amount))}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Legacy free-text Personal / COD notes (orders placed before the rework) */}
            {ext?.personal_cod_notes && (
              <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-3">
                <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-1">$ Personal / COD Items — collect payment on delivery</p>
                <p className="text-sm text-purple-900">{ext.personal_cod_notes}</p>
              </div>
            )}

            {/* Notes */}
            {(order.notes || order.eta) && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Notes / Instructions</p>
                {order.eta   && <p className="text-sm text-amber-900"><strong>ETA:</strong> {order.eta}</p>}
                {order.notes && <p className="text-sm text-amber-900">{order.notes}</p>}
              </div>
            )}

            {/* Status + action button */}
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Status</label>
              {canEdit ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select className="border border-gray-200 rounded px-3 py-1.5 text-sm font-semibold bg-white"
                    value={order.status} onChange={e => onStatusChange(e.target.value as OrderStatus)}>
                    {ORDER_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {order.status !== 'fulfilled' && (
                    <span className="text-xs text-gray-400">
                      Fulfilled = shopped. The final customer email is sent separately from the GTS dashboard.
                    </span>
                  )}
                </div>
              ) : (
                <span className="border border-gray-200 rounded px-3 py-1.5 text-sm font-semibold bg-gray-50 text-gray-600">
                  {ORDER_STATUSES.find(s => s.value === order.status)?.label || order.status}
                </span>
              )}
              {canEdit && order.status !== 'fulfilled' && order.status !== 'cancelled' && (
                groceryItems.length === 0 ? (
                  <button
                    disabled={markingFulfilled}
                    onClick={async () => {
                      if (!(await confirmDialog({
                        title: 'Mark this order as fulfilled?',
                        message: 'No email goes out — GTS sends the final email from the dashboard once everything is wrapped up.',
                      }))) return;
                      setMarkingFulfilled(true);
                      await onStatusChange('fulfilled');
                      setMarkingFulfilled(false);
                    }}
                    className="ml-auto flex items-center gap-1.5 bg-brand-orange text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-60">
                    {markingFulfilled ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Mark as Fulfilled
                  </button>
                ) : (
                  <button onClick={() => setShoppingMode(true)}
                    className="ml-auto flex items-center gap-1.5 bg-brand-green text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-lg hover:bg-brand-gmed transition-colors">
                    <ShoppingCart className="w-4 h-4" /> Enter Shopping Mode
                  </button>
                )
              )}
            </div>

            {/* Crew Change callout for service-only orders */}
            {order.crew_change === 'yes' && groceryItems.length === 0 && (
              <div className="flex items-start gap-4 bg-orange-50 border-2 border-brand-orange rounded-lg p-4">
                <Users className="w-6 h-6 text-brand-orange shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-brand-orange text-sm uppercase tracking-wide mb-2">Crew Change Required</p>
                  <div className="flex gap-8">
                    <div>
                      <p className="text-xs text-gray-500">Arriving</p>
                      <p className="text-2xl font-bold text-brand-navy">{order.crew_arriving ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Departing</p>
                      <p className="text-2xl font-bold text-brand-orange">{order.crew_departing ?? 0}</p>
                    </div>
                  </div>
                  {(order.terminal_name || order.arrival_date) && (
                    <p className="text-xs text-gray-500 mt-2">
                      {order.terminal_name && <span><strong>Location:</strong> {order.terminal_name}&nbsp;&nbsp;</span>}
                      {order.arrival_date  && <span><strong>Date:</strong> {order.arrival_date}{order.arrival_time ? ` at ${order.arrival_time}` : ''}</span>}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Grocery Items */}
            {groceryItems.length > 0 && (
              <div>
                <h3 className="font-display text-base font-bold text-brand-navy mb-3">
                  Grocery Items ({groceryItems.length} lines)
                </h3>

                {/* Item error banner */}
                {itemError && (
                  <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {itemError}
                  </div>
                )}

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">Item #</th>
                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">Item</th>
                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">Pack</th>
                        <th className="px-3 py-2 text-center text-xs font-bold text-gray-500 uppercase">Qty</th>
                        <th className="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase">Unit</th>
                        <th className="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase">Total</th>
                        {canEdit && <th className="px-3 py-2 w-16" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {groceryItems.map(item => (
                        <tr key={item.id} className={item.shopping_status === 'out_of_stock' ? 'opacity-40' : ''}>
                          <td className="px-3 py-2 text-xs text-gray-400 font-mono">{item.upc || '—'}</td>
                          <td className="px-3 py-2">
                            {item.is_substitution && (
                              <span className="inline-block text-[9px] font-bold uppercase tracking-wide text-brand-orange bg-brand-orange/10 px-1 py-0.5 rounded mr-1">Sub</span>
                            )}
                            {item.paid_by === 'cod' && (
                              <span className="inline-block text-[9px] font-bold uppercase tracking-wide text-purple-700 bg-purple-100 px-1 py-0.5 rounded mr-1"
                                title={item.cod_name ? `COD — ${item.cod_name}` : 'COD'}>
                                COD{item.cod_name ? ` · ${item.cod_name}` : ''}
                              </span>
                            )}
                            {item.paid_by === 'deck' && (
                              <span className="inline-block text-[9px] font-bold uppercase tracking-wide text-teal-700 bg-teal-100 px-1 py-0.5 rounded mr-1"
                                title="Deck order — company-billed, listed separately from the grocery allowance">
                                DECK
                              </span>
                            )}
                            <p className={`font-medium text-brand-navy text-xs inline ${item.shopping_status === 'out_of_stock' ? 'line-through' : ''}`}>
                              {item.description}
                            </p>
                            <p className="text-xs text-gray-400">
                              {item.category}
                              {item.location && (
                                <span className="ml-2 text-teal-600 font-semibold">📍 {item.location}</span>
                              )}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{item.pkg_size || '—'}</td>
                          <td className="px-3 py-2 text-center font-bold">
                            {canEdit && editingId === item.id ? (
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  min="0.25"
                                  step="0.25"
                                  className="w-14 border border-brand-sky rounded px-1.5 py-0.5 text-center text-xs font-bold focus:outline-none focus:ring-1 focus:ring-brand-sky"
                                  value={editQty}
                                  onChange={e => setEditQty(e.target.value)}
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveQty(item);
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                />
                                <button
                                  onClick={() => saveQty(item)}
                                  disabled={editSaving}
                                  className="text-brand-green hover:text-green-700 disabled:opacity-50"
                                  title="Save"
                                >
                                  {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="text-gray-400 hover:text-gray-600"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              item.quantity
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-xs">{formatCurrency(item.unit_price)}</td>
                          <td className="px-3 py-2 text-right font-bold text-xs">
                            {formatCurrency(item.actual_total ?? item.unit_price * item.quantity)}
                          </td>
                          {canEdit && (
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-end gap-1">
                                {editingId !== item.id && (
                                  <button
                                    onClick={() => { setEditingId(item.id); setEditQty(String(item.quantity)); setItemError(''); }}
                                    className="p-1 text-gray-400 hover:text-brand-navy transition-colors"
                                    title="Edit quantity"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteItem(item.id)}
                                  disabled={deletingItemId === item.id}
                                  className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                  title="Remove item"
                                >
                                  {deletingItemId === item.id
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Trash2 className="w-3.5 h-3.5" />
                                  }
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {(codItems.length > 0 || deckItems.length > 0) && (
                        <>
                          <tr className="bg-white border-t border-gray-200">
                            <td colSpan={5} className="px-3 py-1.5 text-xs text-gray-500">Grocery — boat allowance (invoiced monthly)</td>
                            <td className="px-3 py-1.5 text-right text-xs font-bold text-brand-navy">{formatCurrency(subtotal - codSubtotal - deckSubtotal)}</td>
                            {canEdit && <td />}
                          </tr>
                          {deckItems.length > 0 && (
                            <tr className="bg-white">
                              <td colSpan={5} className="px-3 py-1.5 text-xs text-teal-700">Deck — invoiced separately (not grocery allowance)</td>
                              <td className="px-3 py-1.5 text-right text-xs font-bold text-teal-700">{formatCurrency(deckSubtotal)}</td>
                              {canEdit && <td />}
                            </tr>
                          )}
                          {codItems.length > 0 && (
                            <tr className="bg-white">
                              <td colSpan={5} className="px-3 py-1.5 text-xs text-purple-700">COD (paid personally — never invoiced)</td>
                              <td className="px-3 py-1.5 text-right text-xs font-bold text-purple-700">{formatCurrency(codSubtotal)}</td>
                              {canEdit && <td />}
                            </tr>
                          )}
                        </>
                      )}
                      <tr className="bg-brand-sand/30 border-t-2 border-brand-gold/30">
                        <td colSpan={canEdit ? 5 : 5} className="px-3 py-2 font-bold text-brand-navy text-sm">
                          SYSTEM TOTAL ({groceryItems.reduce((s, i) => s + i.quantity, 0)} items)
                        </td>
                        <td className="px-3 py-2 text-right font-display text-base font-bold text-brand-navy">
                          {formatCurrency(subtotal)}
                        </td>
                        {canEdit && <td />}
                      </tr>
                      {/* Register total — entered after scanning the pick sheet at the register */}
                      <tr className={`border-t border-gray-200 ${
                        registerTotal && Math.abs(parseFloat(registerTotal) - subtotal) > 1
                          ? 'bg-amber-50'
                          : 'bg-white'
                      }`}>
                        <td colSpan={canEdit ? 5 : 5} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-brand-navy">REGISTER TOTAL</span>
                            <span className="text-xs text-gray-400">(actual amount rung at Sinclair's register)</span>
                            {registerTotal && Math.abs(parseFloat(registerTotal) - subtotal) > 1 && (
                              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                ⚠ {parseFloat(registerTotal) > subtotal ? '+' : ''}{formatCurrency(parseFloat(registerTotal) - subtotal)} vs system
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-sm font-bold text-gray-500">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={registerTotal}
                              onChange={e => setRegisterTotal(e.target.value)}
                              onBlur={e => saveRegisterTotal(e.target.value)}
                              className="w-24 text-right font-display text-base font-bold text-brand-navy border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
                            />
                            {registerTotalSaving && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                          </div>
                        </td>
                        {canEdit && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Add Item */}
                {canEdit && (
                  <div className="mt-2">
                    {!addingItem ? (
                      <button
                        onClick={() => { setAddingItem(true); setItemError(''); }}
                        className="flex items-center gap-1.5 text-xs font-bold text-brand-river hover:text-brand-navy transition-colors py-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Item
                      </button>
                    ) : (
                      <div className="mt-3 border border-brand-sky/30 rounded-lg bg-blue-50/40 p-3 space-y-2">
                        <p className="text-xs font-bold text-brand-navy uppercase tracking-wide">Add Item to Order</p>

                        {!addSelected ? (
                          <>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                              <input
                                type="text"
                                className="input-base pl-9"
                                placeholder="Search products…"
                                value={addSearch}
                                autoFocus
                                onChange={e => { setAddSearch(e.target.value); searchProducts(e.target.value); }}
                              />
                              {addSearching && (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                              )}
                            </div>
                            {addResults.length > 0 && (
                              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto bg-white">
                                {addResults.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => { setAddSelected(p); setAddResults([]); }}
                                    className="w-full text-left px-3 py-2 hover:bg-brand-sand/40 border-b border-gray-100 last:border-0 flex items-center justify-between gap-2"
                                  >
                                    <div>
                                      <p className="text-sm font-semibold text-brand-navy">{p.description}</p>
                                      <p className="text-xs text-gray-400">{p.category}{p.pkg_size ? ` · ${p.pkg_size}` : ''}</p>
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
                                <p className="text-sm font-bold text-brand-navy">{addSelected.description}</p>
                                <p className="text-xs text-gray-400">
                                  {addSelected.category} · {formatCurrency(addSelected.price)}/{addSelected.uom || 'EACH'}
                                </p>
                              </div>
                              <button
                                onClick={() => { setAddSelected(null); setAddSearch(''); }}
                                className="text-gray-400 hover:text-gray-600 text-xs underline ml-2 shrink-0"
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
                                value={addQty}
                                onChange={e => setAddQty(e.target.value)}
                              />
                              <p className="text-xs text-gray-500">
                                = {formatCurrency(addSelected.price * (parseInt(addQty) || 1))}
                              </p>
                            </div>
                          </>
                        )}

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={confirmAdd}
                            disabled={addSaving || !addSelected}
                            className="flex items-center gap-1.5 bg-brand-navy text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-brand-steel transition-colors disabled:opacity-50"
                          >
                            {addSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Add to Order
                          </button>
                          <button onClick={cancelAdd} className="text-sm text-gray-500 hover:text-gray-700 px-2">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Additional Services */}
            {serviceItems.length > 0 && (
              <div>
                <h3 className="font-display text-base font-bold text-brand-navy mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4 text-brand-orange" /> Additional Services
                </h3>
                <div className="space-y-3">
                  {serviceItems.map(item => {
                    const d = item.service_details as Record<string, string> | null;
                    return (
                      <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          {item.service_type === 'parts_pickup'
                            ? <Wrench className="w-4 h-4 text-brand-navy" />
                            : <Package className="w-4 h-4 text-brand-orange" />}
                          <span className="font-bold text-brand-navy text-sm">{item.description}</span>
                        </div>
                        {d && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {item.service_type === 'parts_pickup' && (<>
                              {d.pickup_location && <IB label="Pickup Location" value={d.pickup_location} />}
                              {d.order_number    && <IB label="Order #"         value={d.order_number} />}
                              {d.contact_name    && <IB label="Contact"         value={d.contact_name} />}
                              {d.contact_phone   && <IB label="Phone"           value={d.contact_phone} />}
                            </>)}
                            {item.service_type === 'package_delivery' && (<>
                              {d.description  && <IB label="Description" value={d.description} />}
                              {d.origin       && <IB label="From"        value={d.origin} />}
                              {d.contact_name && <IB label="Contact"     value={d.contact_name} />}
                              {d.contact_phone && <IB label="Phone"      value={d.contact_phone} />}
                            </>)}
                            {item.service_type === 'other_pickup' && (<>
                              {d.url && (
                                <div className="col-span-2">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Item Link</p>
                                  <a href={d.url} target="_blank" rel="noopener noreferrer"
                                    className="text-sm text-brand-river underline break-all">{d.url}</a>
                                </div>
                              )}
                              {d.notes && <IB label="Details (size, color, qty)" value={d.notes} />}
                              <IB label="Handled By" value="Sinclair's Foods" />
                            </>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sinclair Foods Summary */}
            {groceryItems.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5" /> Sinclair Foods Summary
                </p>
                <div className="text-xs text-blue-800 space-y-0.5">
                  {order.vessel_name && <p><strong>Vessel:</strong> {order.vessel_name} {order.vessel_type ? `(${order.vessel_type})` : ''}</p>}
                  {!order.vessel_name && <p><strong>Company:</strong> {order.company_name}</p>}
                  {order.captain_name && <p><strong>Captain:</strong> {order.captain_name} {order.captain_phone ? `· ${order.captain_phone}` : ''}</p>}
                  {order.terminal_name && <p><strong>Deliver To:</strong> {order.terminal_name}</p>}
                  {(order.arrival_date || order.arrival_time) && (
                    <p><strong>Arrival:</strong> {[order.arrival_date, order.arrival_time].filter(Boolean).join(', ')}</p>
                  )}
                  {order.eta && <p><strong>ETA:</strong> {order.eta}</p>}
                  <p><strong>Total Items:</strong> {groceryItems.reduce((s, i) => s + i.quantity, 0)}</p>
                  <p><strong>Order Total:</strong> {formatCurrency(subtotal)}</p>
                </div>
              </div>
            )}

            {/* Billing documents + invoice — owner only */}
            {isOwner && (
              <div className="border-2 border-brand-navy/15 rounded-lg p-4">
                <p className="text-xs font-bold text-brand-navy uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Billing documents &amp; invoice
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {/* Sinclair's receipt */}
                  <div className="border border-gray-200 rounded-lg p-3">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                      <Receipt className="w-3.5 h-3.5" /> Sinclair&apos;s receipt
                    </p>
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                        docReceipt ? 'border-green-300 bg-green-50 text-green-700' : 'border-brand-navy/30 text-brand-navy hover:bg-gray-50'
                      }`}>
                        {docUploading === 'receipt' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        {docReceipt ? 'Replace' : 'Upload'}
                        <input type="file" accept="application/pdf,image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc('receipt', f); }} />
                      </label>
                      {docReceipt && <a href={docReceipt} target="_blank" rel="noreferrer" className="text-xs text-brand-river underline">View</a>}
                    </div>
                  </div>
                  {/* Ingram signed slip */}
                  <div className="border border-gray-200 rounded-lg p-3">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                      <FileSignature className="w-3.5 h-3.5" /> Signed Ingram slip
                    </p>
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                        docSlip ? 'border-green-300 bg-green-50 text-green-700' : 'border-brand-navy/30 text-brand-navy hover:bg-gray-50'
                      }`}>
                        {docUploading === 'slip' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        {docSlip ? 'Replace' : 'Upload'}
                        <input type="file" accept="application/pdf,image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc('slip', f); }} />
                      </label>
                      {docSlip && <a href={docSlip} target="_blank" rel="noreferrer" className="text-xs text-brand-river underline">View</a>}
                    </div>
                  </div>
                </div>
                {/* No invoice button here on purpose: QuickBooks issues the
                    invoices, and delivery billing is worked from the Delivery
                    Ledger's QuickBooks queue. Two places to bill from would
                    mean double-entry. These uploads feed that queue. */}
                <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">
                  These documents attach to the final email and show up in the
                  Delivery Ledger&apos;s QuickBooks queue, where this delivery gets invoiced.
                </p>
              </div>
            )}

          </div>
        </div>
      </div>

      {shoppingMode && (
        <ShoppingModeModal
          order={order}
          onClose={() => { setShoppingMode(false); onRefresh(); }}
          onComplete={() => { setShoppingMode(false); onRefresh(); onClose(); }}
        />
      )}

      {showPickSheet && (
        <PickSheetOverlay
          orderId={order.id}
          orderNumber={order.order_number}
          onClose={() => setShowPickSheet(false)}
        />
      )}

      {confirmDialogEl}
    </>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-100 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-brand-navy">{icon}</span>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide"
          dangerouslySetInnerHTML={{ __html: title }} />
      </div>
      {children}
    </div>
  );
}

function IB({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm font-bold break-all ${highlight ? 'text-brand-gold' : 'text-brand-navy'}`}>{value}</p>
    </div>
  );
}
