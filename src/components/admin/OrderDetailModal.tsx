'use client';
// src/components/admin/OrderDetailModal.tsx

import { useState, useCallback, useEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Download, FileText, Printer, Trash2, Loader2, ShoppingCart,
  Ship, MapPin, Users, Package, Wrench, CheckCircle2, Eye,
  Pencil, Plus, Search, Check, Receipt, FileSignature,
  Scale, Replace, CornerDownRight, PackageX, AlertTriangle, Mail,
} from 'lucide-react';
import { Order, OrderItem, OrderStatus, Product } from '@/types';
import { formatCurrency, formatDate, formatArrivalTime, ORDER_STATUSES } from '@/lib/utils';
import { DeliverySummary } from '@/components/order/DeliverySummary';
import { ShoppingModeModal } from '@/components/admin/ShoppingModeModal';
import { adminFetch, isGtsRole, getAdminRole, hasAdminPermission } from '@/lib/admin-auth';
import { codFeeLabel, codTotalWithFee, allocateCodTotals } from '@/lib/cod-fee';
import { PickSheetOverlay } from '@/components/admin/PickSheetOverlay';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { readCodPayments, codMethodSentence } from '@/lib/cod-payments';

interface OrderDetailModalProps {
  order: Order;
  onClose: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onDownloadPdf: () => void;
  onDelete?: () => void;
  onRefresh: () => void;
  canEdit?: boolean;
  isOwner?: boolean;
  /** Trash in the header. Defaults to isOwner; IMP- imports pass true for GTS. */
  canDelete?: boolean;
  deleting?: boolean;
  /**
   * Mirrors server isSinclairScoped(). When true: no crew-change editor,
   * hide GTS-only service adds (parts_pickup / package_delivery). Catalog,
   * external write-in, and other_pickup remain available.
   */
  isSinclairScoped?: boolean;
}

export function OrderDetailModal({
  order, onClose, onStatusChange, onDownloadPdf,
  onDelete, onRefresh, canEdit = true, isOwner = false, canDelete, deleting = false,
  isSinclairScoped: isSinclairScopedProp,
}: OrderDetailModalProps) {
  const showDelete = (canDelete ?? isOwner) && !!onDelete;
  // Prefer parent flag; fall back to same derivation as admin orders list.
  const isSinclairScoped = typeof isSinclairScopedProp === 'boolean'
    ? isSinclairScopedProp
    : (!isGtsRole(getAdminRole()) || hasAdminPermission('sinclair'));
  const canEditCrew = canEdit && !isSinclairScoped;
  const canAddGtsServices = canEdit && !isSinclairScoped;
  /** Mid-fulfill phone-add: hide once delivered or voided. Shopped still OK. */
  const canAddToOrder = canEdit && order.status !== 'fulfilled' && order.status !== 'cancelled';
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

  useEffect(() => {
    setConfirmSentAt(order.confirmation_email_sent_at ?? null);
    setConfirmSentBy(order.confirmation_email_sent_by ?? null);
  }, [order.id, order.confirmation_email_sent_at, order.confirmation_email_sent_by]);

  async function sendConfirmationNow() {
    setConfirmEmailBusy(true);
    setConfirmEmailErr('');
    try {
      const res = await adminFetch(`/api/orders/${order.id}/send-confirmation-email`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConfirmEmailErr(json.error || 'Could not send the confirmation.');
        return;
      }
      setConfirmSentAt(json.sent_at);
      setConfirmSentBy(json.sent_by);
      onRefresh();
    } finally {
      setConfirmEmailBusy(false);
    }
  }

  // List payload can omit photos. GET /api/orders/:id hydrates image_url from
  // the catalog so register-imported lines show the same package shot as shopping mode.
  useEffect(() => {
    setLocalItems(order.items);
    let cancelled = false;
    (async () => {
      const res = await adminFetch(`/api/orders/${order.id}`);
      if (!res.ok || cancelled) return;
      const full = await res.json();
      if (Array.isArray(full.items) && !cancelled) setLocalItems(full.items);
    })();
    return () => { cancelled = true; };
  }, [order.id]);

  // ── Register total — actual amount Sinclair's rang at the register ──
  const [registerTotal, setRegisterTotal] = useState<string>(
    order.register_total != null ? String(order.register_total) : ''
  );
  const [registerTotalSaving, setRegisterTotalSaving] = useState(false);
  // Already-saved totals come back confirmed, so reopening a shopped order
  // shows "Final total saved" rather than an unsaved-looking button.
  const [registerSaved, setRegisterSaved] = useState(order.register_total != null);
  // Deck rings separately: Dave — "the boat really needs to see, this is how
  // much the deck order was, and this is how much the grocery order was."
  const [deckTotal, setDeckTotal] = useState<string>(
    order.deck_register_total != null ? String(order.deck_register_total) : ''
  );
  const [deckSaved, setDeckSaved] = useState(order.deck_register_total != null);

  /**
   * Confirm the register total — Sinclair's "we're done shopping" action.
   *
   * This is the number the order bills from: the email, the invoice and the
   * billing packet all prefer register_total over the system estimate. It used
   * to save on blur, which meant the most consequential figure in the whole
   * flow was committed by an accident of focus, with no confirmation that it
   * had landed. Now it takes a deliberate click (or Enter) and says so.
   */
  async function confirmRegisterTotal() {
    const raw = registerTotal;
    const val = raw.trim() === '' ? null : parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (raw.trim() !== '' && (isNaN(val!) || val! < 0)) return;
    setRegisterTotalSaving(true);
    try {
      const deckVal = deckTotal.trim() === '' ? null : parseFloat(deckTotal.replace(/[^0-9.]/g, ''));
      if (deckTotal.trim() !== '' && (isNaN(deckVal!) || deckVal! < 0)) return;
      const res = await adminFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ register_total: val, deck_register_total: deckVal }),
      });
      if (!res.ok) return;               // leave it unsaved so it can be retried
      setRegisterSaved(true);
      if (deckVal != null) setDeckSaved(true);

      // ── SHOPPED ── confirming the register total IS the end of Sinclair's
      // involvement, so the order moves to 'shopped' in the same action rather
      // than relying on someone remembering a second dropdown.
      //
      // Only from new/in_progress. An order already 'fulfilled' has been
      // delivered — walking it backwards would drop it out of GTS's completed
      // work — and 'cancelled' must stay cancelled.
      if (val != null && (order.status === 'new' || order.status === 'in_progress')) {
        onStatusChange('shopped');
      }

      onRefresh();                       // pull the new total through to the queue
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

  // ── LINE-BY-LINE SHOPPING ──────────────────────────────────────────────────
  // Everything the shopper needs while standing in the aisle, on the row itself.
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [weighId, setWeighId] = useState<string | null>(null);
  const [weighVal, setWeighVal] = useState('');
  const [subFor, setSubFor] = useState<OrderItem | null>(null);
  const [subSearch, setSubSearch] = useState('');
  const [subResults, setSubResults] = useState<Product[]>([]);
  const [subSearching, setSubSearching] = useState(false);
  const [subPick, setSubPick] = useState<Product | null>(null);
  const [subQty, setSubQty] = useState('1');
  /** Customer preferred-sub guidance when opening the OOS panel. */
  const [preferredHint, setPreferredHint] = useState<string>('');
  const [fillingAll, setFillingAll] = useState(false);
  const [finishStep, setFinishStep] = useState<null | 'accept' | 'register' | 'shopped'>(null);
  const [finishError, setFinishError] = useState('');
  const [priceId, setPriceId] = useState<string | null>(null);
  const [priceVal, setPriceVal] = useState('');
  const [confirmSentAt, setConfirmSentAt] = useState(order.confirmation_email_sent_at ?? null);
  const [confirmSentBy, setConfirmSentBy] = useState(order.confirmation_email_sent_by ?? null);
  const [confirmEmailBusy, setConfirmEmailBusy] = useState(false);
  const [confirmEmailErr, setConfirmEmailErr] = useState('');

  async function savePickupPrice(item: OrderItem) {
    const v = parseFloat(priceVal);
    if (isNaN(v) || v < 0) { setItemError('Enter what it actually cost.'); return; }
    const r = await itemAction(item.id, { action: 'set_price', unit_price: v });
    if (r) { setPriceId(null); setPriceVal(''); }
  }

  /** Substitutions rendered under the line they replace. */
  const subsByParent = localItems
    .filter(i => i.is_substitution && i.substitutes_item_id)
    .reduce((acc, i) => {
      const k = i.substitutes_item_id as string;
      (acc[k] ||= []).push(i);
      return acc;
    }, {} as Record<string, OrderItem[]>);

  /** By-weight lines: LB uom, a fractional quantity, or a price-embedded UPC. */
  function isWeighable(i: OrderItem): boolean {
    if ((i.uom || '').toUpperCase() === 'LB') return true;
    if (!Number.isInteger(Number(i.quantity))) return true;
    const upc = (i.upc || '').replace(/\D/g, '');
    return upc.length === 12 && upc.startsWith('2') && upc.endsWith('00000');
  }

  /** Apply an item action and fold the response back into local state. */
  async function itemAction(itemId: string, body: Record<string, unknown>) {
    setRowBusy(itemId); setItemError('');
    try {
      const res = await adminFetch(`/api/orders/${order.id}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const r = await res.json();
      if (!res.ok) { setItemError(r?.error || 'Could not update that line'); return null; }
      setLocalItems(prev => {
        let next = prev.map(i => (r.item && i.id === r.item.id ? { ...i, ...r.item } : i));
        if (r.substitution) next = [...next, r.substitution as OrderItem];
        // 'reset' removes any substitution children server-side.
        if (body.action === 'reset') next = next.filter(i => i.substitutes_item_id !== itemId);
        return next;
      });
      return r;
    } finally {
      setRowBusy(null);
    }
  }

  /** Tick = shopped. Clicking an already-shopped line undoes it (fat-finger fix). */
  async function markShopped(item: OrderItem) {
    await itemAction(item.id, { action: item.shopping_status === 'shopped' ? 'reset' : 'shopped' });
  }

  async function saveWeight(item: OrderItem) {
    const w = parseFloat(weighVal);
    if (!w || w <= 0) { setItemError('Enter a weight greater than zero.'); return; }
    const r = await itemAction(item.id, { action: 'set_weight', actual_weight: w });
    if (r) { setWeighId(null); setWeighVal(''); }
  }

  /** Out of stock — with a replacement, or without one if there's nothing to swap. */
  async function applySubstitution(withProduct: boolean) {
    if (!subFor) return;
    const body: Record<string, unknown> = { action: 'out_of_stock' };
    if (withProduct) {
      if (!subPick) { setItemError('Pick a replacement, or choose "No replacement".'); return; }
      const q = parseFloat(subQty);
      if (!q || q <= 0) { setItemError('Enter a quantity for the replacement.'); return; }
      body.substitution = { product_id: subPick.id, quantity: q };
    }
    const r = await itemAction(subFor.id, body);
    if (r) { setSubFor(null); setSubPick(null); setSubSearch(''); setSubResults([]); setPreferredHint(''); }
  }

  /**
   * Open OOS / substitute panel. If the cook set a preferred product and it is
   * still active, pre-select it. mode=none defaults the shopper toward
   * "No replacement"; store can still override.
   */
  async function openSubPanel(item: OrderItem) {
    setSubFor(item);
    setSubSearch('');
    setSubResults([]);
    setSubPick(null);
    setSubQty(String(item.quantity));
    setItemError('');
    setPreferredHint('');

    const mode = item.preferred_sub_mode;
    if (mode === 'none') {
      setPreferredHint('Customer asked: do not substitute — default is drop the line (you can still override).');
      return;
    }
    if (mode === 'store_choice') {
      setPreferredHint('Customer said: store chooses the substitute.');
      return;
    }
    if (mode === 'product' && item.preferred_sub_product_id) {
      const label = (item.preferred_sub_description || '').trim() || 'preferred product';
      setPreferredHint(`Customer preferred: ${label}`);
      try {
        const q = encodeURIComponent(item.preferred_sub_description || item.preferred_sub_product_id);
        const res = await adminFetch(`/api/products?search=${q}&status=active&per_page=24`);
        if (!res.ok) return;
        const d = await res.json();
        const match = (d.products || []).find((p: Product) => p.id === item.preferred_sub_product_id);
        if (match) {
          setSubPick(match);
          setSubSearch(match.description);
        } else {
          setPreferredHint(`Customer preferred: ${label} — not currently active in catalog; pick another or drop the line.`);
        }
      } catch {
        /* shopper can still search manually */
      }
    }
  }

  /**
   * Sinclair's finish: pick list is paper, register is the price authority.
   * One bulk UPDATE (not one request per line — that hung 130-line orders
   * and dumped people back to the queue with the order merely In Progress),
   * then register total, then Shopped.
   */
  function openFinishShopping() {
    setFinishError('');
    const pending = groceryItems.filter(i => i.shopping_status === 'pending');
    setFinishStep(pending.length ? 'accept' : 'register');
  }

  async function acceptAsOrdered() {
    setFillingAll(true);
    setFinishError('');
    try {
      const res = await adminFetch(`/api/orders/${order.id}/fill`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFinishError(json.error || 'Could not accept those lines.');
        return;
      }
      setLocalItems(prev => prev.map(i =>
        i.item_type === 'grocery' && i.shopping_status === 'pending'
          ? { ...i, shopping_status: 'shopped' as const }
          : i));
      setFinishStep('register');
    } finally {
      setFillingAll(false);
    }
  }

  function continueFromRegister() {
    const val = parseFloat(String(registerTotal).replace(/[^0-9.]/g, ''));
    if (!registerTotal.trim() || Number.isNaN(val) || val < 0) {
      setFinishError('Enter what the register rang — that is the amount this order bills from.');
      return;
    }
    if (deckItems.length && deckTotal.trim()) {
      const d = parseFloat(deckTotal.replace(/[^0-9.]/g, ''));
      if (Number.isNaN(d) || d < 0) {
        setFinishError('Deck register total looks off.');
        return;
      }
    }
    setFinishError('');
    setFinishStep('shopped');
  }

  async function finishShopping(markShopped: boolean) {
    setFillingAll(true);
    setFinishError('');
    try {
      const val = parseFloat(String(registerTotal).replace(/[^0-9.]/g, ''));
      const deckVal = deckTotal.trim() === '' ? null : parseFloat(deckTotal.replace(/[^0-9.]/g, ''));
      const res = await adminFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ register_total: val, deck_register_total: deckVal }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setFinishError(j.error || 'Could not save the register total.');
        return;
      }
      setRegisterSaved(true);
      if (deckVal != null) setDeckSaved(true);
      setFinishStep(null);
      if (markShopped && (order.status === 'new' || order.status === 'in_progress')) {
        onStatusChange('shopped');
      } else {
        onRefresh();
      }
    } finally {
      setFillingAll(false);
    }
  }

  /** Product search for the substitution picker. */
  const searchSubs = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSubResults([]); return; }
    setSubSearching(true);
    try {
      const res = await adminFetch(`/api/products?search=${encodeURIComponent(q)}&status=active&per_page=12`);
      if (res.ok) { const d = await res.json(); setSubResults(d.products || []); }
    } finally { setSubSearching(false); }
  }, []);

  // Add item panel — mode picker: catalog | write-in | service
  type AddMode = 'catalog' | 'writein' | 'service' | null;
  const [addingItem, setAddingItem] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState<Product[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  const [addSelected, setAddSelected] = useState<Product | null>(null);
  const [addQty, setAddQty] = useState('1');
  const [addPaidBy, setAddPaidBy] = useState<'vessel' | 'deck' | 'cod'>('vessel');
  const [addCodName, setAddCodName] = useState('');
  const [writeDesc, setWriteDesc] = useState('');
  const [writePrice, setWritePrice] = useState('0');
  const [svcKind, setSvcKind] = useState<'parts_pickup' | 'package_delivery' | 'other_pickup'>('other_pickup');
  const [svcPartsLoc, setSvcPartsLoc] = useState('');
  const [svcPartsOrder, setSvcPartsOrder] = useState('');
  const [svcPartsContact, setSvcPartsContact] = useState('');
  const [svcPartsPhone, setSvcPartsPhone] = useState('');
  const [svcPkgDesc, setSvcPkgDesc] = useState('');
  const [svcPkgOrigin, setSvcPkgOrigin] = useState('');
  const [svcPkgContact, setSvcPkgContact] = useState('');
  const [svcPkgPhone, setSvcPkgPhone] = useState('');
  const [svcOtherUrl, setSvcOtherUrl] = useState('');
  const [svcOtherNotes, setSvcOtherNotes] = useState('');
  const [svcOtherPaidBy, setSvcOtherPaidBy] = useState<'grocery' | 'cod'>('grocery');
  const [svcOtherCodName, setSvcOtherCodName] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [itemError, setItemError] = useState('');
  const [paidByBusyId, setPaidByBusyId] = useState<string | null>(null);

  // Local crew-change mirror so GTS can edit without waiting on parent refresh
  const [localCrew, setLocalCrew] = useState({
    crew_change: order.crew_change ?? 'no',
    crew_change_notes: order.crew_change_notes ?? '',
    crew_arriving: order.crew_arriving != null ? String(order.crew_arriving) : '',
    crew_departing: order.crew_departing != null ? String(order.crew_departing) : '',
  });
  const [crewSaving, setCrewSaving] = useState(false);
  useEffect(() => {
    setLocalCrew({
      crew_change: order.crew_change ?? 'no',
      crew_change_notes: order.crew_change_notes ?? '',
      crew_arriving: order.crew_arriving != null ? String(order.crew_arriving) : '',
      crew_departing: order.crew_departing != null ? String(order.crew_departing) : '',
    });
  }, [order.id, order.crew_change, order.crew_change_notes, order.crew_arriving, order.crew_departing]);

  const groceryItems = localItems.filter(i => i.item_type !== 'service');
  const serviceItems = localItems.filter(i => i.item_type === 'service');
  const subtotal = groceryItems
    .filter(i => i.shopping_status !== 'out_of_stock')
    .reduce((s, i) => s + (i.actual_total ?? i.unit_price * i.quantity), 0);
  const codItems = groceryItems.filter(i => i.paid_by === 'cod');
  // OUTSIDE PICKUPS ARE COD TOO — every one of them, whether the boat settles
  // it or a named crew member does. They have to be in the COD subtotal or the
  // handling fee is computed on the wrong base. Dave: "the handling fee is for
  // all of them combined, not per item... You got TV, you got a carton of
  // cigarettes, you got all this. What's the total? We add in handling fee."
  const outsidePickups = serviceItems.filter(i => i.service_type === 'other_pickup');
  const outsideSubtotal = outsidePickups
    .filter(i => i.shopping_status !== 'out_of_stock')
    .reduce((s, i) => s + Number(i.actual_total ?? i.unit_price * i.quantity), 0);
  const codSubtotal = codItems
    .filter(i => i.shopping_status !== 'out_of_stock')
    .reduce((s, i) => s + (i.actual_total ?? i.unit_price * i.quantity), 0)
    + outsideSubtotal;
  /** Outside pickups still waiting on a price — the fee is wrong until they're keyed. */
  const unpricedPickups = outsidePickups.filter(i => !Number(i.unit_price));
  // COD lines grouped per crew member. Hoisted because a FLAT handling fee has
  // to be apportioned across these people — the split needs to know how many
  // there are, and the per-person figures must add up to the header total.
  const codGroups = Array.from(codItems.reduce((acc, i) => {
    const name = (i.cod_name || '').trim() || 'Crew member';
    if (!acc.has(name)) acc.set(name, [] as typeof codItems);
    acc.get(name)!.push(i);
    return acc;
  }, new Map<string, typeof codItems>()).entries())
    .sort((a, b) => a[0].localeCompare(b[0]));
  // Deck lines — company-billed but listed separately from the grocery allowance
  const deckItems = groceryItems.filter(i => i.paid_by === 'deck');
  const deckSubtotal = deckItems
    .filter(i => i.shopping_status !== 'out_of_stock')
    .reduce((s, i) => s + (i.actual_total ?? i.unit_price * i.quantity), 0);
  // Per-person payment (empty on orders placed before this existed — the
  // order-level block below is the fallback for exactly those).
  const codPayments   = readCodPayments(order.extended_info);
  const codPayByName  = new Map(codPayments.map(p => [p.name, p]));
  // People who owe only through a linked item have no catalog lines and so
  // never reach codGroups. This modal is where Mary works out who owes what.
  const codLinkedOnly = codPayments.filter(p =>
    p.linked_items > 0 && !codGroups.some(([name]) => name === p.name));

  const codMethodLabel = order.cod_payment_method === 'credit_card' ? 'Credit Card — call to collect'
    : order.cod_payment_method === 'venmo' ? 'Venmo — send a payment request'
    : order.cod_payment_method === 'cashapp' ? 'Cash App — send a payment request'
    : order.cod_payment_method === 'cash' ? 'Cash (legacy)' : null;

  // COD handling fee — defaults to 5%, editable per order (big-ticket externals
  // may warrant more or less; Dave: "default 5%, but we can edit it ourselves").
  const [feePct, setFeePct] = useState<string>(String(order.cod_fee_percent ?? 5));
  // Flat mode is remembered from the order itself: if an amount was keyed, that
  // IS the fee, so reopening shows the dollar field rather than a percentage
  // that no longer applies.
  const [feeMode, setFeeMode] = useState<'pct' | 'flat'>(
    order.cod_fee_amount != null ? 'flat' : 'pct'
  );
  const [feeFlat, setFeeFlat] = useState<string>(
    order.cod_fee_amount != null ? String(order.cod_fee_amount) : ''
  );
  const [savingFee, setSavingFee] = useState(false);

  const feeNum = Math.max(0, parseFloat(feePct) || 0);
  const feeFlatNum = feeFlat.trim() === '' ? null : Math.max(0, parseFloat(feeFlat) || 0);
  // What the crew is actually charged, under whichever mode is selected.
  const effectiveFee = feeMode === 'flat'
    ? (feeFlatNum ?? 0)
    : Math.round(codSubtotal * feeNum) / 100;
  // ROWS MUST TRACK THE FEE MARY IS TYPING, NOT THE ONE ON THE ORDER.
  //
  // The header above already used `effectiveFee` (live), while each person's
  // row was computed from order.cod_fee_* (stored) — so editing the fee moved
  // the total and left the per-person rows sitting at the old number until the
  // save round-tripped. This feeds the live values in as a fee source, and
  // allocates in cents so the rows always sum to the header.
  const liveFee = {
    cod_fee_percent: feeNum,
    cod_fee_amount: feeMode === 'flat' ? feeFlatNum : null,
  };
  const codShares = allocateCodTotals(liveFee, codGroups.map(([name, list]) => ({
    name,
    subtotal: list.reduce((s, i) => s + Number(i.actual_total ?? i.unit_price * i.quantity), 0),
  })), codSubtotal);

  const feeDirty =
    feeMode === 'flat'
      ? feeFlatNum !== (order.cod_fee_amount ?? null)
      : order.cod_fee_amount != null || feeNum !== Number(order.cod_fee_percent ?? 5);

  async function saveFee() {
    setSavingFee(true);
    try {
      // Switching back to % must CLEAR the flat amount — leaving it set would
      // silently keep overriding the percentage the user just chose.
      const payload = feeMode === 'flat'
        ? { cod_fee_amount: feeFlatNum, cod_fee_percent: feeNum }
        : { cod_fee_amount: null, cod_fee_percent: feeNum };
      await adminFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  // ── Add item (catalog / write-in / service) ───────────────────────────────
  function resetAddForm() {
    setAddMode(null);
    setAddSearch('');
    setAddResults([]);
    setAddSelected(null);
    setAddQty('1');
    setAddPaidBy('vessel');
    setAddCodName('');
    setWriteDesc('');
    setWritePrice('0');
    setSvcKind(canAddGtsServices ? 'parts_pickup' : 'other_pickup');
    setSvcPartsLoc(''); setSvcPartsOrder(''); setSvcPartsContact(''); setSvcPartsPhone('');
    setSvcPkgDesc(''); setSvcPkgOrigin(''); setSvcPkgContact(''); setSvcPkgPhone('');
    setSvcOtherUrl(''); setSvcOtherNotes('');
    setSvcOtherPaidBy('grocery'); setSvcOtherCodName('');
    setItemError('');
  }

  function cancelAdd() {
    setAddingItem(false);
    resetAddForm();
  }

  async function postNewItem(body: Record<string, unknown>) {
    setAddSaving(true);
    setItemError('');
    try {
      const res = await adminFetch(`/api/orders/${order.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to add item');
      const { item } = data;
      setLocalItems(prev => [...prev, item]);
      setAddingItem(false);
      resetAddForm();
      onRefresh();
    } catch (e) {
      setItemError(e instanceof Error ? e.message : 'Failed to add item — please try again');
    } finally {
      setAddSaving(false);
    }
  }

  async function confirmAdd() {
    if (addMode === 'catalog') {
      if (!addSelected) return;
      if (addPaidBy === 'cod' && !addCodName.trim()) {
        setItemError('COD needs the crew member\'s name');
        return;
      }
      const qty = parseFloat(addQty) || 1;
      await postNewItem({
        product_id: addSelected.id,
        quantity: qty,
        paid_by: addPaidBy,
        cod_name: addPaidBy === 'cod' ? addCodName.trim() : '',
      });
      return;
    }
    if (addMode === 'writein') {
      if (!writeDesc.trim()) { setItemError('Description required'); return; }
      if (addPaidBy === 'cod' && !addCodName.trim()) {
        setItemError('COD needs the crew member\'s name');
        return;
      }
      const qty = parseFloat(addQty) || 1;
      const unit_price = parseFloat(writePrice);
      if (Number.isNaN(unit_price) || unit_price < 0) {
        setItemError('Price must be 0 or more (0 = pending register)');
        return;
      }
      await postNewItem({
        description: writeDesc.trim(),
        quantity: qty,
        unit_price,
        paid_by: addPaidBy,
        cod_name: addPaidBy === 'cod' ? addCodName.trim() : '',
        item_type: 'grocery',
      });
      return;
    }
    if (addMode === 'service') {
      if (svcKind === 'parts_pickup') {
        if (!canAddGtsServices) { setItemError('Only GTS can add Parts Pickup'); return; }
        await postNewItem({
          item_type: 'service',
          service_type: 'parts_pickup',
          pickup_location: svcPartsLoc,
          order_number: svcPartsOrder,
          contact_name: svcPartsContact,
          contact_phone: svcPartsPhone,
        });
        return;
      }
      if (svcKind === 'package_delivery') {
        if (!canAddGtsServices) { setItemError('Only GTS can add Package Delivery'); return; }
        await postNewItem({
          item_type: 'service',
          service_type: 'package_delivery',
          description: svcPkgDesc,
          origin: svcPkgOrigin,
          contact_name: svcPkgContact,
          contact_phone: svcPkgPhone,
        });
        return;
      }
      // other_pickup
      if (!svcOtherUrl.trim() && !svcOtherNotes.trim()) {
        setItemError('Outside pickup needs a link or notes');
        return;
      }
      if (svcOtherPaidBy === 'cod' && !svcOtherCodName.trim()) {
        setItemError('COD outside pickup needs the crew member\'s name');
        return;
      }
      await postNewItem({
        item_type: 'service',
        service_type: 'other_pickup',
        url: svcOtherUrl.trim(),
        notes: svcOtherNotes.trim(),
        paid_by: svcOtherPaidBy,
        cod_name: svcOtherPaidBy === 'cod' ? svcOtherCodName.trim() : '',
      });
    }
  }

  async function setItemPaidBy(item: OrderItem, paid_by: 'vessel' | 'deck' | 'cod', cod_name: string) {
    if (paid_by === 'cod' && !cod_name.trim()) {
      setItemError('COD needs the crew member\'s name');
      return;
    }
    setPaidByBusyId(item.id);
    setItemError('');
    try {
      const res = await adminFetch(`/api/orders/${order.id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_paid_by', paid_by, cod_name: paid_by === 'cod' ? cod_name.trim() : '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update billing');
      setLocalItems(prev => prev.map(i => i.id === data.item.id ? data.item : i));
      onRefresh();
    } catch (e) {
      setItemError(e instanceof Error ? e.message : 'Failed to update billing');
    } finally {
      setPaidByBusyId(null);
    }
  }

  async function saveCrewChange() {
    if (!canEditCrew) return;
    setCrewSaving(true);
    setItemError('');
    try {
      const body: Record<string, unknown> = {
        crew_change: localCrew.crew_change,
        crew_change_notes: localCrew.crew_change === 'no' ? null : (localCrew.crew_change_notes || null),
      };
      if (localCrew.crew_change === 'yes') {
        body.crew_arriving = localCrew.crew_arriving.trim() === '' ? null : parseInt(localCrew.crew_arriving, 10);
        body.crew_departing = localCrew.crew_departing.trim() === '' ? null : parseInt(localCrew.crew_departing, 10);
      } else {
        body.crew_arriving = null;
        body.crew_departing = null;
      }
      const res = await adminFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save crew change');
      onRefresh();
    } catch (e) {
      setItemError(e instanceof Error ? e.message : 'Failed to save crew change');
    } finally {
      setCrewSaving(false);
    }
  }

  function renderLineEdits(item: OrderItem) {
    if (!canEdit) return null;
    if (editingId === item.id) {
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <input
            type="number"
            min="0.25"
            step="0.25"
            className="w-16 border border-brand-sky rounded px-1.5 py-1 text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-brand-sky"
            value={editQty}
            onChange={e => setEditQty(e.target.value)}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') saveQty(item);
              if (e.key === 'Escape') setEditingId(null);
            }}
          />
          <button onClick={() => saveQty(item)} disabled={editSaving}
            className="p-2 text-brand-green hover:text-green-700 disabled:opacity-50" title="Save">
            {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
          <button onClick={() => setEditingId(null)}
            className="p-2 text-gray-400 hover:text-gray-600" title="Cancel">
            <X className="w-4 h-4" />
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-end gap-0.5 flex-wrap">
        {item.item_type !== 'service' && (
          <select
            className="text-[10px] font-bold border border-gray-200 rounded px-1 py-1 max-w-[6.5rem] bg-white text-gray-700"
            title="Bill as"
            disabled={paidByBusyId === item.id}
            value={item.paid_by === 'cod' ? 'cod' : item.paid_by === 'deck' ? 'deck' : 'vessel'}
            onChange={async (e) => {
              const pb = e.target.value as 'vessel' | 'deck' | 'cod';
              if (pb === 'cod') {
                const name = window.prompt('Crew member name for COD:', item.cod_name || '') || '';
                if (!name.trim()) { e.target.value = item.paid_by === 'cod' ? 'cod' : item.paid_by === 'deck' ? 'deck' : 'vessel'; return; }
                await setItemPaidBy(item, 'cod', name);
              } else {
                await setItemPaidBy(item, pb, '');
              }
            }}
          >
            <option value="vessel">Boat</option>
            <option value="deck">Deck</option>
            <option value="cod">COD</option>
          </select>
        )}
        <button
          onClick={() => markShopped(item)}
          disabled={rowBusy === item.id}
          className={`p-2 transition-colors ${
            item.shopping_status === 'shopped'
              ? 'text-green-600'
              : 'text-gray-400 hover:text-green-600'
          }`}
          title={item.shopping_status === 'shopped' ? 'Shopped — click to undo' : 'Mark shopped'}
        >
          <Check className="w-4 h-4" />
        </button>
        {isWeighable(item) && (
          <button
            onClick={() => { setWeighId(item.id); setWeighVal(item.actual_weight != null ? String(item.actual_weight) : ''); setItemError(''); }}
            className={`p-2 transition-colors ${item.actual_weight != null ? 'text-brand-orange' : 'text-gray-400 hover:text-brand-orange'}`}
            title={item.actual_weight != null ? `Weighed ${item.actual_weight} lb — click to change` : 'Enter actual weight'}
          >
            <Scale className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => { setEditingId(item.id); setEditQty(String(item.quantity)); setItemError(''); }}
          className="p-2 text-gray-400 hover:text-brand-navy transition-colors"
          title="Edit quantity"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => { void openSubPanel(item); }}
          className="p-2 text-gray-400 hover:text-amber-600 transition-colors"
          title="Out of stock / substitute"
        >
          <Replace className="w-4 h-4" />
        </button>
        <button
          onClick={() => deleteItem(item.id)}
          disabled={deletingItemId === item.id}
          className="p-2 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
          title="Remove item"
        >
          {deletingItemId === item.id
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/50 sm:p-4">
        <div className="bg-white sm:rounded-xl shadow-2xl w-full sm:max-w-7xl h-[100dvh] sm:h-auto sm:max-h-[94dvh] flex flex-col overflow-hidden animate-fade-in">

          {/* Header */}
          <div className="bg-brand-navy px-4 sm:px-6 py-3 sm:py-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-4 rounded-none sm:rounded-t-xl flex items-center justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <p className="text-brand-sky text-xs uppercase tracking-wide">Order Details</p>
              <h2 className="text-white font-display text-lg sm:text-xl font-bold truncate">{order.order_number}</h2>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
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
              {showDelete && (
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

          <div className="p-4 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-5 overflow-auto min-h-0 flex-1 overscroll-contain">

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

            {/* Shared delivery card */}
          <div className="mb-4">
            <DeliverySummary order={order} variant="admin" />
          </div>

          {/* Delivery */}
            {(order.terminal_name || order.arrival_date || order.delivery_method) && (
              <Section icon={<MapPin className="w-3.5 h-3.5" />} title="Delivery Information">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {order.terminal_name && <IB label="Terminal / Location" value={order.terminal_name} highlight />}
                  {order.arrival_date  && <IB label="Arrival Date"        value={order.arrival_date}  highlight />}
                  {order.arrival_time  && <IB label="Arrival Time"        value={formatArrivalTime(order.arrival_time)}  highlight />}
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
                      {ext.secondary_arrival_time && <IB label="Arrival Time" value={formatArrivalTime(ext.secondary_arrival_time)} />}
                      {ext.secondary_delivery_method && (
                        <IB label="Method" value={ext.secondary_delivery_method === 'boat' ? 'Boat Delivery' : 'Van Delivery'} />
                      )}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* Crew Change — GTS editable; Sinclair display-only when already set */}
            {canEditCrew ? (
              <Section icon={<Users className="w-3.5 h-3.5" />} title="Crew Change">
                <div className="flex flex-wrap gap-2 mb-2">
                  {([
                    ['no', 'No'],
                    ['maybe', 'Maybe'],
                    ['yes', 'Yes'],
                  ] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setLocalCrew(c => ({ ...c, crew_change: val }))}
                      className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded border transition-colors ${
                        localCrew.crew_change === val
                          ? val === 'yes'
                            ? 'bg-orange-100 text-brand-orange border-orange-300'
                            : val === 'maybe'
                              ? 'bg-amber-100 text-amber-700 border-amber-300'
                              : 'bg-gray-100 text-gray-700 border-gray-300'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {localCrew.crew_change === 'yes' && (
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">
                      Arriving
                      <input type="number" min="0" className="input-base mt-0.5"
                        value={localCrew.crew_arriving}
                        onChange={e => setLocalCrew(c => ({ ...c, crew_arriving: e.target.value }))} />
                    </label>
                    <label className="text-xs font-bold text-gray-500 uppercase">
                      Departing
                      <input type="number" min="0" className="input-base mt-0.5"
                        value={localCrew.crew_departing}
                        onChange={e => setLocalCrew(c => ({ ...c, crew_departing: e.target.value }))} />
                    </label>
                  </div>
                )}
                {localCrew.crew_change !== 'no' && (
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                    Notes
                    <textarea
                      className="input-base mt-0.5 text-sm font-normal normal-case"
                      rows={2}
                      value={localCrew.crew_change_notes}
                      onChange={e => setLocalCrew(c => ({ ...c, crew_change_notes: e.target.value }))}
                      placeholder={localCrew.crew_change === 'maybe' ? 'To be confirmed…' : 'Crew change details'}
                    />
                  </label>
                )}
                <button
                  type="button"
                  onClick={saveCrewChange}
                  disabled={crewSaving}
                  className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  {crewSaving ? 'Saving…' : 'Save crew change'}
                </button>
              </Section>
            ) : (
              <>
                {localCrew.crew_change === 'yes' && (
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
                {localCrew.crew_change === 'maybe' && (
                  <Section icon={<Users className="w-3.5 h-3.5" />} title="Crew Change">
                    <span className="inline-block mb-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">Maybe — to be confirmed</span>
                    {order.crew_change_notes ? (
                      <p className="text-sm text-gray-600">{order.crew_change_notes}</p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Customer may need a crew change — confirm before arrival.</p>
                    )}
                  </Section>
                )}
              </>
            )}

            {/* COD items — collected at delivery, NEVER invoiced */}
            {(codItems.length > 0 || codLinkedOnly.length > 0) && (
              <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-3">
                <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-2">
                  $ COD Items — collect {formatCurrency(codSubtotal + effectiveFee)}{effectiveFee > 0 ? ` incl. ${codFeeLabel(order, codSubtotal)}` : ''} · separated by crew member (not on the company invoice)
                </p>
                <div className="space-y-2 mb-2">
                  {codGroups.map(([name, list]) => (
                      <div key={name} className="bg-white/60 rounded-lg px-2.5 py-1.5">
                        <p className="text-sm font-bold text-purple-800 flex justify-between">
                          <span>{name}</span>
                          <span>
                            {formatCurrency(codShares.get(name) ?? 0)}
                            {effectiveFee > 0 && <span className="font-normal text-purple-500 text-xs"> incl. fee</span>}
                          </span>
                        </p>
                        {list.map(i => (
                          <p key={i.id} className="text-xs text-purple-900 pl-2">
                            {i.quantity}× {i.description} · {formatCurrency(i.actual_total ?? i.unit_price * i.quantity)}
                          </p>
                        ))}
                        {codPayByName.get(name) && (
                          <p className="text-xs text-purple-700 pl-2 mt-0.5">
                            <strong>Pays by:</strong> {codMethodSentence(codPayByName.get(name)!)}
                          </p>
                        )}
                      </div>
                    ))}
                  {codLinkedOnly.map(p => (
                    <div key={p.name} className="bg-white/60 rounded-lg px-2.5 py-1.5">
                      <p className="text-sm font-bold text-purple-800 flex justify-between">
                        <span>{p.name}</span>
                        <span className="text-purple-600">
                          {p.linked_items === 1 ? 'Linked item' : `${p.linked_items} linked items`}
                          <span className="font-normal text-purple-500 text-xs"> priced when bought</span>
                        </span>
                      </p>
                      <p className="text-xs text-purple-700 pl-2 mt-0.5">
                        <strong>Pays by:</strong> {codMethodSentence(p)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-purple-800 border-t border-purple-200 pt-2 space-y-1">
                  {codPayments.length === 0 && codMethodLabel && <p><strong>Payment method:</strong> {codMethodLabel}</p>}
                  {codPayments.length === 0 && (order.cod_payment_method === 'venmo' || order.cod_payment_method === 'cashapp') && (
                    <p>
                      <strong>Send request to:</strong>{' '}
                      <span className="font-mono font-bold">{order.cod_payment_handle || 'no handle given — call them'}</span>
                      {' '}· never accept an inbound send — request the exact final amount
                    </p>
                  )}
                  {codPayments.length === 0 && order.cod_payment_method === 'credit_card' && (
                    <p>
                      <strong>Call:</strong> {order.cod_preferred_phone || 'no number given'}
                      {order.cod_contact_time && <> · <strong>Best time (around):</strong> {order.cod_contact_time}</>}
                    </p>
                  )}
                  {/* HANDLING FEE — percentage by default, flat amount when the
                      percentage can't work. Off-catalog runs (a Walmart TV) have
                      no price until Sinclair's has bought the thing, so 5% of a
                      $0 line is $0 and the real cost of the trip is absorbed.
                      A keyed dollar amount overrides the percentage entirely. */}
                  {unpricedPickups.length > 0 && (
                    <p className="flex items-start gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>
                        {unpricedPickups.length} outside pickup{unpricedPickups.length === 1 ? '' : 's'} still unpriced —
                        the handling fee is calculated on the COD total, so enter what they cost under
                        Additional Services before collecting.
                      </span>
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>Handling fee:</strong>
                    {canEdit ? (
                      <>
                        <div className="inline-flex rounded-md border border-purple-300 overflow-hidden">
                          {([['pct', '%'], ['flat', '$']] as const).map(([m, sym]) => (
                            <button key={m} type="button"
                              onClick={() => setFeeMode(m)}
                              className={`px-2 py-0.5 text-xs font-bold ${
                                feeMode === m ? 'bg-purple-600 text-white' : 'bg-white text-purple-700 hover:bg-purple-50'
                              }`}>{sym}</button>
                          ))}
                        </div>
                        {feeMode === 'pct' ? (
                          <>
                            <input
                              type="number" min="0" max="100" step="0.5"
                              className="w-16 border border-purple-300 rounded px-1.5 py-0.5 text-center font-bold bg-white"
                              value={feePct}
                              onChange={e => setFeePct(e.target.value)}
                            />
                            <span>%</span>
                          </>
                        ) : (
                          <>
                            <span>$</span>
                            <input
                              type="number" min="0" step="0.01" placeholder="0.00"
                              className="w-24 border border-purple-300 rounded px-1.5 py-0.5 text-right font-bold bg-white"
                              value={feeFlat}
                              onChange={e => setFeeFlat(e.target.value)}
                            />
                          </>
                        )}
                        {feeDirty && (
                          <button onClick={saveFee} disabled={savingFee}
                            className="text-[10px] font-bold uppercase bg-purple-600 text-white px-2 py-0.5 rounded hover:bg-purple-700 disabled:opacity-50">
                            {savingFee ? 'Saving…' : 'Save'}
                          </button>
                        )}
                      </>
                    ) : (
                      <span>{codFeeLabel(order, codSubtotal)}</span>
                    )}
                    <span className="text-purple-700">
                      = {formatCurrency(effectiveFee)} on {formatCurrency(codSubtotal)}
                      {feeMode === 'flat' && (
                        <span className="text-purple-500"> · split across crew by what each spent</span>
                      )}
                    </span>
                  </div>
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
                    value={order.status} onChange={async e => {
                      const next = e.target.value as OrderStatus;
                      if (next === 'cancelled' && order.status !== 'cancelled') {
                        if (!(await confirmDialog({
                          title: `Cancel ${order.order_number}?`,
                          message: 'It drops out of the shopping queue. You can still reopen it from Cancelled if this was a test.',
                          danger: true,
                        }))) return;
                      }
                      onStatusChange(next);
                    }}>
                    {/* Sinclair's cannot select Fulfilled — that means Grafton
                        delivered AND sent the customer their final email, which
                        carries GTS's delivery fee. The server rejects it too;
                        this just avoids showing an option that would 403. The
                        CURRENT status always stays listed so an order already
                        fulfilled still renders its own value correctly. */}
                    {ORDER_STATUSES
                      .filter(s => s.value !== 'fulfilled' || isGtsRole(getAdminRole()) || order.status === 'fulfilled')
                      .map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                  </select>
                  {order.status !== 'fulfilled' && (
                    <span className="text-xs text-gray-400">
                      {isGtsRole(getAdminRole())
                        ? 'Shopped = Sinclair\'s rang it up. Fulfilled = delivered; the final customer email is sent separately from the GTS dashboard.'
                        : 'Confirm the register total to mark this Shopped — that completes it on Sinclair\'s side.'}
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
                    className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-1.5 bg-brand-orange text-white text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-60">
                    {markingFulfilled ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Mark as Fulfilled
                  </button>
                ) : (
                  <button onClick={() => setShoppingMode(true)}
                    className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-1.5 bg-brand-green text-white text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-lg hover:bg-brand-gmed transition-colors">
                    <ShoppingCart className="w-4 h-4" /> Enter Shopping Mode
                  </button>
                )
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Emails
              </p>
              <div className="text-sm">
                <p className="font-semibold text-brand-navy">Boat confirmation</p>
                {confirmSentAt ? (
                  <p className="text-xs text-gray-600">
                    Sent {formatDate(confirmSentAt)}
                    {confirmSentBy ? ` · ${confirmSentBy}` : ''}
                  </p>
                ) : confirmSentBy && confirmSentBy.toLowerCase().startsWith('skipped') ? (
                  <p className="text-xs text-amber-800">Not sent — {confirmSentBy}</p>
                ) : (
                  <p className="text-xs text-gray-500">Not sent (or placed before we tracked this)</p>
                )}
                {canEdit && !confirmSentAt && (
                  <button type="button" disabled={confirmEmailBusy}
                    onClick={sendConfirmationNow}
                    className="mt-1.5 text-xs font-bold text-brand-navy hover:underline disabled:opacity-40">
                    {confirmEmailBusy ? 'Sending…' : 'Send confirmation now'}
                  </button>
                )}
                {confirmEmailErr && <p className="text-xs text-red-600 mt-1">{confirmEmailErr}</p>}
              </div>
              <div className="text-sm pt-2 border-t border-gray-200">
                <p className="font-semibold text-brand-navy">Final shopped email</p>
                {order.shopped_email_sent_at && !(order.shopped_email_sent_by || '').toLowerCase().startsWith('dismissed') ? (
                  <p className="text-xs text-gray-600">
                    Sent {formatDate(order.shopped_email_sent_at)}
                    {order.shopped_email_sent_by ? ` · ${order.shopped_email_sent_by}` : ''}
                  </p>
                ) : (order.shopped_email_sent_by || '').toLowerCase().startsWith('dismissed') ? (
                  <p className="text-xs text-gray-500">Skipped — {order.shopped_email_sent_by}</p>
                ) : (
                  <p className="text-xs text-gray-500">
                    Not sent yet. GTS sends this from the dashboard after delivery billing is ready.
                  </p>
                )}
              </div>
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
                      {order.arrival_date  && <span><strong>Date:</strong> {order.arrival_date}{order.arrival_time ? ` at ${formatArrivalTime(order.arrival_time)}` : ''}</span>}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Grocery Items (+ mid-fulfill add even when empty) */}
            {(groceryItems.length > 0 || canAddToOrder) && (
              <div>
                <h3 className="font-display text-base font-bold text-brand-navy mb-3">
                  Grocery Items{groceryItems.length > 0 ? ` (${groceryItems.length} lines)` : ''}
                </h3>

                {/* Item error banner */}
                {itemError && (
                  <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {itemError}
                  </div>
                )}

                {/* Mobile: one card per line so edit controls never clip */}
                <div className="md:hidden space-y-2">
                  {groceryItems.map(item => (
                    <div key={item.id} className={`rounded-xl border border-gray-200 bg-white p-3 ${item.shopping_status === 'out_of_stock' ? 'opacity-50' : ''}`}>
                      <div className="flex gap-3">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt="" loading="lazy" decoding="async"
                            className="w-14 h-14 object-contain rounded-lg border border-gray-200 bg-white shrink-0" />
                        ) : (
                          <div className="w-14 h-14 rounded-lg border border-dashed border-gray-200 bg-gray-50 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={`font-medium text-brand-navy text-sm leading-snug ${item.shopping_status === 'out_of_stock' ? 'line-through' : ''}`}>
                            {item.description}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5 break-all">
                            {item.upc || 'no UPC'}{item.pkg_size ? ` · ${item.pkg_size}` : ''}
                            {item.location ? ` · ${item.location}` : ''}
                          </p>
                          <p className="text-sm mt-1">
                            <b>{item.quantity}</b>
                            <span className="text-gray-400"> × {formatCurrency(item.unit_price)} = </span>
                            <b className="text-brand-navy">{formatCurrency(item.actual_total ?? item.unit_price * item.quantity)}</b>
                          </p>
                        </div>
                      </div>
                      {canEdit && (
                        <div className="mt-2 pt-2 border-t border-gray-100 flex justify-end">
                          {renderLineEdits(item)}
                        </div>
                      )}
                      {canEdit && weighId === item.id && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs bg-orange-50 border border-orange-200 rounded-lg p-2">
                          <Scale className="w-4 h-4 text-brand-orange shrink-0" />
                          <input type="number" step="0.01" min="0.01" autoFocus
                            className="w-24 border border-orange-300 rounded px-2 py-1 text-right font-bold"
                            placeholder="lb"
                            value={weighVal}
                            onChange={e => setWeighVal(e.target.value)} />
                          <button onClick={() => saveWeight(item)} disabled={rowBusy === item.id || !weighVal}
                            className="btn-primary text-xs px-3 py-1 disabled:opacity-40">Confirm</button>
                          <button onClick={() => setWeighId(null)} className="text-gray-500">Cancel</button>
                        </div>
                      )}
                      {subsByParent[item.id]?.map(sub => (
                        <div key={sub.id} className="mt-2 pl-3 border-l-2 border-amber-300 text-sm">
                          <p className="text-[10px] font-bold uppercase text-amber-700">Sub</p>
                          <p className="font-medium text-brand-navy">{sub.description}</p>
                          <p className="text-xs text-gray-500">{sub.quantity} × {formatCurrency(sub.unit_price)}</p>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="rounded-xl border border-brand-gold/30 bg-brand-sand/30 p-3 space-y-2">
                    <div className="flex justify-between text-sm font-bold text-brand-navy">
                      <span>System total</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <label className="block text-xs font-bold text-gray-500 uppercase">
                      Register total
                      <div className="mt-1 flex items-center gap-2">
                        <span>$</span>
                        <input type="number" step="0.01" min="0" placeholder="0.00"
                          value={registerTotal}
                          onChange={e => { setRegisterTotal(e.target.value); setRegisterSaved(false); }}
                          className="flex-1 min-w-0 input-base font-display font-bold text-brand-navy" />
                        <button type="button" onClick={confirmRegisterTotal}
                          disabled={registerTotalSaving || registerTotal.trim() === '' || registerSaved}
                          className="btn-primary text-xs px-3 py-2 shrink-0 disabled:opacity-40">
                          {registerSaved ? 'Saved' : 'Save'}
                        </button>
                      </div>
                    </label>
                    {deckItems.length > 0 && (
                      <label className="block text-xs font-bold text-teal-700 uppercase">
                        Deck register
                        <div className="mt-1 flex items-center gap-2">
                          <span>$</span>
                          <input type="number" step="0.01" min="0" placeholder="0.00"
                            value={deckTotal}
                            onChange={e => { setDeckTotal(e.target.value); setDeckSaved(false); }}
                            className="flex-1 min-w-0 input-base font-display font-bold text-teal-900" />
                        </div>
                      </label>
                    )}
                  </div>
                </div>

                <div className="hidden md:block border border-gray-200 rounded-lg overflow-x-auto w-full">
                  <table className="text-sm w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-2 py-2 w-14" />
                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase w-[11%]">Item #</th>
                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase w-[42%]">Item</th>
                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase w-[12%]">Pack</th>
                        <th className="px-3 py-2 text-center text-xs font-bold text-gray-500 uppercase w-[8%]">Qty</th>
                        <th className="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase w-[10%]">Unit</th>
                        <th className="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase w-[10%]">Total</th>
                        {canEdit && (
                          <th className="px-2 py-2 text-right text-xs font-bold text-gray-500 uppercase sticky right-0 bg-gray-50 w-[12%] shadow-[-8px_0_8px_-6px_rgba(0,0,0,0.12)]">
                            Edit
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {groceryItems.map(item => (
                        <Fragment key={item.id}>
                        <tr className={item.shopping_status === 'out_of_stock' ? 'opacity-40' : ''}>
                          <td className="px-2 py-2">
                            {item.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.image_url}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="w-11 h-11 object-contain rounded border border-gray-200 bg-white"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded border border-dashed border-gray-200 bg-gray-50" />
                            )}
                          </td>
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
                            <p className={`font-medium text-brand-navy text-xs ${item.shopping_status === 'out_of_stock' ? 'line-through' : ''}`}>
                              {item.description}
                            </p>
                            {item.preferred_sub_mode === 'product' && (
                              <p className="text-[10px] font-bold text-amber-800">Preferred sub: {item.preferred_sub_description || 'selected product'}</p>
                            )}
                            {item.preferred_sub_mode === 'none' && (
                              <p className="text-[10px] font-bold text-amber-800">Do not substitute</p>
                            )}
                            {item.preferred_sub_mode === 'store_choice' && (
                              <p className="text-[10px] font-bold text-amber-800">Store chooses substitute</p>
                            )}
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
                            <td className="px-2 py-2 whitespace-nowrap sticky right-0 bg-white min-w-[9.5rem] shadow-[-8px_0_8px_-6px_rgba(0,0,0,0.12)]">
                              {renderLineEdits(item)}
                            </td>
                          )}
                        </tr>

                        {/* Inline weight entry — opens under the row it belongs
                            to, so the shopper never loses their place. */}
                        {canEdit && weighId === item.id && (
                          <tr className="bg-orange-50/60">
                            <td colSpan={canEdit ? 8 : 7} className="px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <Scale className="w-4 h-4 text-brand-orange shrink-0" />
                                <span className="font-bold text-brand-navy">Actual weight for {item.description}</span>
                                <input type="number" step="0.01" min="0.01" autoFocus
                                  className="w-24 border border-orange-300 rounded px-2 py-1 text-right font-bold"
                                  placeholder="0.00"
                                  value={weighVal}
                                  onChange={e => setWeighVal(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveWeight(item); if (e.key === 'Escape') setWeighId(null); }} />
                                <span>lb</span>
                                <span className="text-gray-500">
                                  × {formatCurrency(item.unit_price)}/lb =
                                  <b className="text-brand-navy ml-1">
                                    {formatCurrency((parseFloat(weighVal) || 0) * item.unit_price)}
                                  </b>
                                </span>
                                <button onClick={() => saveWeight(item)} disabled={rowBusy === item.id || !weighVal}
                                  className="btn-primary text-xs px-3 py-1 disabled:opacity-40">
                                  {rowBusy === item.id ? 'Saving…' : 'Confirm weight'}
                                </button>
                                <button onClick={() => setWeighId(null)} className="text-gray-400 hover:text-gray-600">Cancel</button>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* The substitution shows INDENTED UNDER the original,
                            which stays visible and struck through. Dave, on his
                            own system: "this one's not available, and we gave
                            you this one... Right underneath it. I like that." */}
                        {subsByParent[item.id]?.map(sub => (
                          <tr key={sub.id} className="bg-amber-50/50">
                            <td className="px-3 py-1.5 text-xs text-gray-400 font-mono">{sub.upc || '—'}</td>
                            <td className="px-3 py-1.5" colSpan={2}>
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                <CornerDownRight className="w-3 h-3" /> Substituted with
                              </span>
                              <p className="font-medium text-brand-navy text-xs">{sub.description}</p>
                              <p className="text-xs text-gray-400">
                                {sub.pkg_size || ''}{sub.location ? ` · 📍 ${sub.location}` : ''}
                              </p>
                            </td>
                            <td className="px-3 py-1.5 text-center font-bold text-xs">{sub.quantity}</td>
                            <td className="px-3 py-1.5 text-right text-xs">{formatCurrency(sub.unit_price)}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-xs">
                              {formatCurrency(sub.actual_total ?? sub.unit_price * sub.quantity)}
                            </td>
                            {canEdit && (
                              <td className="px-3 py-1.5 text-right">
                                <button onClick={() => deleteItem(sub.id)}
                                  className="p-1 text-gray-400 hover:text-red-500" title="Remove substitution">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        </Fragment>
                      ))}
                    </tbody>
                    <tfoot>
                      {(codItems.length > 0 || deckItems.length > 0) && (
                        <>
                          <tr className="bg-white border-t border-gray-200">
                            <td colSpan={6} className="px-3 py-1.5 text-xs text-gray-500">Grocery — boat allowance (invoiced monthly)</td>
                            <td className="px-3 py-1.5 text-right text-xs font-bold text-brand-navy">{formatCurrency(subtotal - codSubtotal - deckSubtotal)}</td>
                            {canEdit && <td />}
                          </tr>
                          {deckItems.length > 0 && (
                            <tr className="bg-white">
                              <td colSpan={6} className="px-3 py-1.5 text-xs text-teal-700">Deck — invoiced separately (not grocery allowance)</td>
                              <td className="px-3 py-1.5 text-right text-xs font-bold text-teal-700">{formatCurrency(deckSubtotal)}</td>
                              {canEdit && <td />}
                            </tr>
                          )}
                          {codItems.length > 0 && (
                            <tr className="bg-white">
                              <td colSpan={6} className="px-3 py-1.5 text-xs text-purple-700">COD (paid personally — never invoiced)</td>
                              <td className="px-3 py-1.5 text-right text-xs font-bold text-purple-700">{formatCurrency(codSubtotal)}</td>
                              {canEdit && <td />}
                            </tr>
                          )}
                        </>
                      )}
                      <tr className="bg-brand-sand/30 border-t-2 border-brand-gold/30">
                        <td colSpan={6} className="px-3 py-2 font-bold text-brand-navy text-sm">
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
                        {/* ONE full-width cell, wrapping. This was split across
                            a label cell and the narrow price column, so the
                            input + Save button + confirmation text overflowed
                            and were clipped by the table edge. */}
                        <td colSpan={canEdit ? 8 : 7} className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <span className="text-sm font-bold text-brand-navy">REGISTER TOTAL</span>
                            <span className="text-xs text-gray-400">(actual amount rung at Sinclair's register)</span>
                            {registerTotal && Math.abs(parseFloat(registerTotal) - subtotal) > 1 && (
                              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                ⚠ {parseFloat(registerTotal) > subtotal ? '+' : ''}{formatCurrency(parseFloat(registerTotal) - subtotal)} vs system
                              </span>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                            <span className="text-sm font-bold text-gray-500">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={registerTotal}
                              onChange={e => { setRegisterTotal(e.target.value); setRegisterSaved(false); }}
                              onKeyDown={e => { if (e.key === 'Enter') confirmRegisterTotal(); }}
                              className="w-24 text-right font-display text-base font-bold text-brand-navy border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
                            />
                            {/* Explicit confirm, not a blur-save. Keying the
                                register total is the moment Sinclair's is done
                                shopping — it's the number everything downstream
                                bills from, so it deserves a deliberate action
                                and visible confirmation rather than silently
                                saving when focus happens to leave the field. */}
                            <button
                              type="button"
                              onClick={confirmRegisterTotal}
                              disabled={registerTotalSaving || registerTotal.trim() === '' || registerSaved}
                              className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap ${
                                registerSaved
                                  ? 'bg-green-50 text-green-700 border-green-200 cursor-default'
                                  : 'bg-brand-navy text-white border-brand-navy hover:bg-brand-navy/90 disabled:opacity-40 disabled:cursor-not-allowed'
                              }`}
                            >
                              {registerTotalSaving
                                ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
                                : registerSaved
                                  ? <><CheckCircle2 className="w-3 h-3" /> Final total saved</>
                                  : <><Check className="w-3 h-3" /> Save final total</>}
                            </button>
                          </div>
                          </div>
                          {registerSaved && (
                            <p className="w-full text-[11px] text-green-700 font-semibold">
                              Shopping complete — this is the amount the order bills from.
                            </p>
                          )}
                        </td>
                      </tr>

                      {/* DECK RINGS SEPARATELY. Only shown when the order
                          actually has deck lines — asking for a deck total on a
                          grocery-only order is a field nobody should have to
                          skip past. Dave, on typing two: "No. Only in the event
                          we have grocery versus deck. Yeah, we have to do that." */}
                      {deckItems.length > 0 && (
                        <tr className="border-t border-gray-200 bg-teal-50/40">
                          <td colSpan={canEdit ? 8 : 7} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                              <span className="text-sm font-bold text-teal-800">DECK REGISTER TOTAL</span>
                              <span className="text-xs text-gray-400">
                                (rung separately · {deckItems.length} line{deckItems.length === 1 ? '' : 's'} · system {formatCurrency(deckSubtotal)})
                              </span>
                              {deckTotal && Math.abs(parseFloat(deckTotal) - deckSubtotal) > 1 && (
                                <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                  ⚠ {parseFloat(deckTotal) > deckSubtotal ? '+' : ''}{formatCurrency(parseFloat(deckTotal) - deckSubtotal)} vs system
                                </span>
                              )}
                              <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                                <span className="text-sm font-bold text-gray-500">$</span>
                                <input
                                  type="number" step="0.01" min="0" placeholder="0.00"
                                  value={deckTotal}
                                  onChange={e => { setDeckTotal(e.target.value); setDeckSaved(false); }}
                                  onKeyDown={e => { if (e.key === 'Enter') confirmRegisterTotal(); }}
                                  className="w-24 text-right font-display text-base font-bold text-teal-900 border border-teal-200 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                                />
                                {deckSaved && (
                                  <span className="flex items-center gap-1 text-xs font-bold text-green-700">
                                    <CheckCircle2 className="w-3 h-3" /> Saved
                                  </span>
                                )}
                              </div>
                              <p className="w-full text-[11px] text-teal-800">
                                Billed apart from the grocery allowance — the vessel receipt shows both figures.
                                Saved together with the grocery total.
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>

                {/* ── SUBSTITUTION PANEL ── opens from a row's Replace icon and
                    names the line it's replacing, so there's no doubt which
                    item is being swapped when several are out at once. */}
                {canEdit && subFor && (
                  <div className="mt-3 border-2 border-amber-300 rounded-lg bg-amber-50/60 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Out of stock</p>
                        <p className="text-sm font-bold text-brand-navy">{subFor.description}</p>
                        <p className="text-xs text-gray-500">
                          {subFor.pkg_size || ''}{subFor.pkg_size ? ' · ' : ''}{formatCurrency(subFor.unit_price)}
                          {subFor.paid_by === 'cod' && <span className="ml-2 text-purple-700 font-bold">COD · {subFor.cod_name || 'crew member'}</span>}
                          {subFor.paid_by === 'deck' && <span className="ml-2 text-teal-700 font-bold">DECK</span>}
                        </p>
                      </div>
                      <button onClick={() => { setSubFor(null); setSubPick(null); setPreferredHint(''); }}
                        className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                    </div>

                    {preferredHint && (
                      <p className="text-xs font-semibold text-amber-900 bg-amber-100/80 border border-amber-300 rounded px-2.5 py-1.5">
                        {preferredHint}
                      </p>
                    )}
                    {subFor.preferred_sub_mode === 'none' && !subPick && (
                      <p className="text-[11px] text-amber-800">
                        Prefer <strong>No replacement — drop the line</strong> unless you have a reason to override.
                      </p>
                    )}

                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input autoFocus type="text" placeholder="Search a replacement…"
                        className="input-base text-sm pl-8 w-full"
                        value={subSearch}
                        onChange={e => { setSubSearch(e.target.value); setSubPick(null); searchSubs(e.target.value); }} />
                    </div>

                    {subSearching && <p className="text-xs text-gray-400">Searching…</p>}
                    {!!subResults.length && !subPick && (
                      <div className="max-h-44 overflow-y-auto border border-amber-200 rounded bg-white divide-y divide-gray-100">
                        {subResults.map(p => (
                          <button key={p.id} onClick={() => setSubPick(p)}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-amber-50 flex items-center gap-2">
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-semibold text-brand-navy truncate">{p.description}</span>
                              <span className="block text-[11px] text-gray-400">
                                {p.pkg_size || ''}{p.location ? ` · 📍 ${p.location}` : ''}
                              </span>
                            </span>
                            <span className="text-xs font-bold text-brand-navy shrink-0">{formatCurrency(p.price)}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {subPick && (
                      <div className="flex flex-wrap items-center gap-2 bg-white border border-amber-200 rounded px-2.5 py-2">
                        <CornerDownRight className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="text-xs font-bold text-brand-navy flex-1 min-w-0 truncate">{subPick.description}</span>
                        <input type="number" min="0.25" step="0.25"
                          className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-center text-xs font-bold"
                          value={subQty} onChange={e => setSubQty(e.target.value)} />
                        <span className="text-xs font-bold text-brand-navy">
                          {formatCurrency(subPick.price * (parseFloat(subQty) || 0))}
                        </span>
                        <button onClick={() => setSubPick(null)} className="text-xs text-gray-400 hover:text-gray-600">change</button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button onClick={() => applySubstitution(true)}
                        disabled={!subPick || rowBusy === subFor.id}
                        className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40">
                        {rowBusy === subFor.id ? 'Saving…' : 'Substitute'}
                      </button>
                      {/* Sometimes there is simply nothing to swap in. */}
                      <button onClick={() => applySubstitution(false)}
                        disabled={rowBusy === subFor.id}
                        className="flex items-center gap-1 text-xs font-bold text-amber-800 border border-amber-300 bg-white rounded px-3 py-1.5 hover:bg-amber-100 disabled:opacity-40">
                        <PackageX className="w-3.5 h-3.5" /> No replacement — drop the line
                      </button>
                      <span className="text-[11px] text-gray-500">
                        Either way the original stays on the sheet, struck through, so the boat can see what happened.
                      </span>
                    </div>
                  </div>
                )}

                {/* Add Item — catalog / external write-in / service */}
                {canAddToOrder && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {(order.status === 'new' || order.status === 'in_progress') && !addingItem && (
                      <p className="text-[11px] text-gray-500">
                        Customer called after placing? Add items, COD, or a service here.
                      </p>
                    )}
                  <div className="flex flex-wrap items-center gap-3">
                    {!addingItem ? (
                      <>
                      <button
                        onClick={() => { setAddingItem(true); setAddMode(null); setItemError(''); }}
                        className="flex items-center gap-1.5 text-xs font-bold text-brand-river hover:text-brand-navy transition-colors py-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add to order
                      </button>
                      {canEdit && order.status !== 'shopped' && order.status !== 'fulfilled' && order.status !== 'cancelled' && (
                        <button
                          onClick={openFinishShopping}
                          disabled={fillingAll}
                          className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-brand-green rounded-lg px-3 py-2.5 w-full sm:w-auto hover:bg-brand-green/90 disabled:opacity-50"
                          title="Accept the pick list as ordered, enter the register total, mark Shopped"
                        >
                          {fillingAll
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Working…</>
                            : <><CheckCircle2 className="w-3.5 h-3.5" /> Finish shopping</>}
                        </button>
                      )}
                      </>
                    ) : (
                      <div className="mt-3 w-full border border-brand-sky/30 rounded-lg bg-blue-50/40 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-brand-navy uppercase tracking-wide">Add to order</p>
                          <button onClick={cancelAdd} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                        </div>

                        {/* Mode picker */}
                        <div className="flex flex-wrap gap-1.5">
                          {([
                            ['catalog', 'Catalog'],
                            ['writein', 'External / write-in'],
                            ['service', 'Service'],
                          ] as const).map(([mode, label]) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => {
                                setAddMode(mode);
                                setItemError('');
                                if (mode === 'writein') {
                                  setAddPaidBy('cod');
                                } else if (mode === 'catalog') {
                                  setAddPaidBy('vessel');
                                } else if (mode === 'service') {
                                  setSvcKind(canAddGtsServices ? 'parts_pickup' : 'other_pickup');
                                }
                              }}
                              className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                                addMode === mode
                                  ? 'bg-brand-navy text-white border-brand-navy'
                                  : 'bg-white text-brand-navy border-gray-200 hover:border-brand-sky'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {addMode === 'catalog' && (
                          <div className="space-y-2">
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
                                    {addResults.map(prod => (
                                      <button
                                        key={prod.id}
                                        onClick={() => { setAddSelected(prod); setAddResults([]); }}
                                        className="w-full text-left px-3 py-2 hover:bg-brand-sand/40 border-b border-gray-100 last:border-0 flex items-center justify-between gap-2"
                                      >
                                        <div>
                                          <p className="text-sm font-semibold text-brand-navy">{prod.description}</p>
                                          <p className="text-xs text-gray-400">{prod.category}{prod.pkg_size ? ` · ${prod.pkg_size}` : ''}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <p className="text-sm font-bold text-brand-green">{formatCurrency(prod.price)}</p>
                                          <p className="text-xs text-gray-400">{prod.uom || 'EACH'}</p>
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
                                <div className="flex flex-wrap items-center gap-2">
                                  <label className="text-xs font-bold text-gray-600 shrink-0">Qty</label>
                                  <input
                                    type="number"
                                    min="0.25"
                                    step="0.25"
                                    className="input-base w-20 text-center font-bold"
                                    value={addQty}
                                    onChange={e => setAddQty(e.target.value)}
                                  />
                                  <p className="text-xs text-gray-500">
                                    = {formatCurrency(addSelected.price * (parseFloat(addQty) || 1))}
                                  </p>
                                </div>
                              </>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-gray-600">Bill as</span>
                              {(['vessel', 'deck', 'cod'] as const).map(pb => (
                                <button key={pb} type="button" onClick={() => setAddPaidBy(pb)}
                                  className={`text-[11px] font-bold uppercase px-2 py-1 rounded border ${
                                    addPaidBy === pb
                                      ? pb === 'cod' ? 'bg-purple-100 text-purple-800 border-purple-300'
                                        : pb === 'deck' ? 'bg-teal-100 text-teal-800 border-teal-300'
                                        : 'bg-brand-navy text-white border-brand-navy'
                                      : 'bg-white text-gray-600 border-gray-200'
                                  }`}>
                                  {pb === 'vessel' ? 'Boat' : pb === 'deck' ? 'Deck' : 'COD'}
                                </button>
                              ))}
                              {addPaidBy === 'cod' && (
                                <input
                                  className="input-base flex-1 min-w-[8rem] text-sm"
                                  placeholder="Crew name"
                                  value={addCodName}
                                  onChange={e => setAddCodName(e.target.value)}
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {addMode === 'writein' && (
                          <div className="space-y-2">
                            <p className="text-[11px] text-gray-500">Sinclair will pick up off-shelf (cigarettes, etc.). Price can be 0 until register.</p>
                            <label className="block text-xs font-bold text-gray-600">
                              Item name
                              <input className="input-base mt-0.5" value={writeDesc} onChange={e => setWriteDesc(e.target.value)}
                                placeholder="e.g. Marlboro Red carton" autoFocus />
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <label className="text-xs font-bold text-gray-600">
                                Qty
                                <input type="number" min="0.25" step="0.25" className="input-base mt-0.5 w-20 text-center font-bold"
                                  value={addQty} onChange={e => setAddQty(e.target.value)} />
                              </label>
                              <label className="text-xs font-bold text-gray-600">
                                Unit price ($)
                                <input type="number" min="0" step="0.01" className="input-base mt-0.5 w-24 text-right font-bold"
                                  value={writePrice} onChange={e => setWritePrice(e.target.value)} />
                              </label>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-gray-600">Bill as</span>
                              {(['vessel', 'deck', 'cod'] as const).map(pb => (
                                <button key={pb} type="button" onClick={() => setAddPaidBy(pb)}
                                  className={`text-[11px] font-bold uppercase px-2 py-1 rounded border ${
                                    addPaidBy === pb
                                      ? pb === 'cod' ? 'bg-purple-100 text-purple-800 border-purple-300'
                                        : pb === 'deck' ? 'bg-teal-100 text-teal-800 border-teal-300'
                                        : 'bg-brand-navy text-white border-brand-navy'
                                      : 'bg-white text-gray-600 border-gray-200'
                                  }`}>
                                  {pb === 'vessel' ? 'Boat' : pb === 'deck' ? 'Deck' : 'COD'}
                                </button>
                              ))}
                              {addPaidBy === 'cod' && (
                                <input
                                  className="input-base flex-1 min-w-[8rem] text-sm"
                                  placeholder="Crew name"
                                  value={addCodName}
                                  onChange={e => setAddCodName(e.target.value)}
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {addMode === 'service' && (
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                              {canAddGtsServices && (
                                <>
                                  <button type="button" onClick={() => setSvcKind('parts_pickup')}
                                    className={`text-[11px] font-bold px-2 py-1 rounded border ${svcKind === 'parts_pickup' ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white border-gray-200'}`}>
                                    Parts Pickup
                                  </button>
                                  <button type="button" onClick={() => setSvcKind('package_delivery')}
                                    className={`text-[11px] font-bold px-2 py-1 rounded border ${svcKind === 'package_delivery' ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white border-gray-200'}`}>
                                    Package / Other Delivery
                                  </button>
                                </>
                              )}
                              <button type="button" onClick={() => setSvcKind('other_pickup')}
                                className={`text-[11px] font-bold px-2 py-1 rounded border ${svcKind === 'other_pickup' ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white border-gray-200'}`}>
                                Outside pickup
                              </button>
                            </div>
                            {!canAddGtsServices && (
                              <p className="text-[11px] text-gray-500">Sinclair: outside pickups only (Walmart / off-catalog). Parts &amp; package delivery are GTS.</p>
                            )}
                            {svcKind === 'parts_pickup' && canAddGtsServices && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <label className="text-xs font-bold text-gray-600">Pickup location
                                  <input className="input-base mt-0.5" value={svcPartsLoc} onChange={e => setSvcPartsLoc(e.target.value)} /></label>
                                <label className="text-xs font-bold text-gray-600">Order #
                                  <input className="input-base mt-0.5" value={svcPartsOrder} onChange={e => setSvcPartsOrder(e.target.value)} /></label>
                                <label className="text-xs font-bold text-gray-600">Contact
                                  <input className="input-base mt-0.5" value={svcPartsContact} onChange={e => setSvcPartsContact(e.target.value)} /></label>
                                <label className="text-xs font-bold text-gray-600">Phone
                                  <input className="input-base mt-0.5" value={svcPartsPhone} onChange={e => setSvcPartsPhone(e.target.value)} /></label>
                              </div>
                            )}
                            {svcKind === 'package_delivery' && canAddGtsServices && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <label className="text-xs font-bold text-gray-600 sm:col-span-2">Description
                                  <input className="input-base mt-0.5" value={svcPkgDesc} onChange={e => setSvcPkgDesc(e.target.value)} /></label>
                                <label className="text-xs font-bold text-gray-600">From / origin
                                  <input className="input-base mt-0.5" value={svcPkgOrigin} onChange={e => setSvcPkgOrigin(e.target.value)} /></label>
                                <label className="text-xs font-bold text-gray-600">Contact
                                  <input className="input-base mt-0.5" value={svcPkgContact} onChange={e => setSvcPkgContact(e.target.value)} /></label>
                                <label className="text-xs font-bold text-gray-600">Phone
                                  <input className="input-base mt-0.5" value={svcPkgPhone} onChange={e => setSvcPkgPhone(e.target.value)} /></label>
                              </div>
                            )}
                            {svcKind === 'other_pickup' && (
                              <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-600">Item link (URL)
                                  <input className="input-base mt-0.5" value={svcOtherUrl} onChange={e => setSvcOtherUrl(e.target.value)}
                                    placeholder="https://…" /></label>
                                <label className="block text-xs font-bold text-gray-600">Details (size, color, qty)
                                  <input className="input-base mt-0.5" value={svcOtherNotes} onChange={e => setSvcOtherNotes(e.target.value)} /></label>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-bold text-gray-600">Bill as</span>
                                  <button type="button" onClick={() => setSvcOtherPaidBy('grocery')}
                                    className={`text-[11px] font-bold uppercase px-2 py-1 rounded border ${svcOtherPaidBy === 'grocery' ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white border-gray-200'}`}>Boat</button>
                                  <button type="button" onClick={() => setSvcOtherPaidBy('cod')}
                                    className={`text-[11px] font-bold uppercase px-2 py-1 rounded border ${svcOtherPaidBy === 'cod' ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-white border-gray-200'}`}>COD</button>
                                  {svcOtherPaidBy === 'cod' && (
                                    <input className="input-base flex-1 min-w-[8rem] text-sm" placeholder="Crew name"
                                      value={svcOtherCodName} onChange={e => setSvcOtherCodName(e.target.value)} />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {itemError && addMode && (
                          <p className="text-xs text-red-600 font-semibold">{itemError}</p>
                        )}

                        {addMode && (
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={confirmAdd}
                              disabled={
                                addSaving
                                || (addMode === 'catalog' && !addSelected)
                                || (addMode === 'writein' && !writeDesc.trim())
                              }
                              className="flex items-center gap-1.5 bg-brand-navy text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-brand-steel transition-colors disabled:opacity-50"
                            >
                              {addSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                              Add to Order
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
                              {/* WHAT IT ACTUALLY COST. Unknown until Sinclair's
                                  has bought it, and until it's keyed this line
                                  sits at $0 — so the COD handling fee is
                                  computed on a total that's missing the TV. */}
                              <div className="col-span-2">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Price paid</p>
                                {canEdit && priceId === item.id ? (
                                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                    <span className="text-sm font-bold text-gray-500">$</span>
                                    <input type="number" step="0.01" min="0" autoFocus placeholder="0.00"
                                      className="w-28 border border-purple-300 rounded px-2 py-0.5 text-right font-bold text-sm"
                                      value={priceVal}
                                      onChange={e => setPriceVal(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') savePickupPrice(item); if (e.key === 'Escape') setPriceId(null); }} />
                                    <button onClick={() => savePickupPrice(item)} disabled={rowBusy === item.id}
                                      className="btn-primary text-xs px-2.5 py-1 disabled:opacity-40">
                                      {rowBusy === item.id ? 'Saving…' : 'Save'}
                                    </button>
                                    <button onClick={() => setPriceId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-sm font-bold ${Number(item.unit_price) ? 'text-brand-navy' : 'text-amber-700'}`}>
                                      {Number(item.unit_price)
                                        ? formatCurrency(Number(item.unit_price) * Number(item.quantity || 1))
                                        : 'Not priced yet'}
                                    </span>
                                    {canEdit && (
                                      <button
                                        onClick={() => { setPriceId(item.id); setPriceVal(Number(item.unit_price) ? String(item.unit_price) : ''); setItemError(''); }}
                                        className="text-xs font-bold text-brand-river hover:underline">
                                        {Number(item.unit_price) ? 'Change' : 'Enter price'}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                              {/* Who pays. A COD outside pickup is a crew
                                  member's personal purchase and gets rung up
                                  separately — the picker must see this before
                                  the register, not after. */}
                              <IB
                                label="Paid By"
                                value={d.paid_by === 'cod'
                                  ? `COD — ${d.cod_name || '(no name given)'}`
                                  : 'COD — to the boat'}
                              />
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
                    <p><strong>Arrival:</strong> {[order.arrival_date, formatArrivalTime(order.arrival_time)].filter(Boolean).join(', ')}</p>
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

      {finishStep && createPortal(
        <div className="fixed inset-0 z-[96] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-xl p-5 space-y-4 max-h-[90dvh] overflow-y-auto">
            {finishStep === 'accept' && (
              <>
                <h2 className="font-display text-lg font-bold text-brand-navy">Accept as ordered?</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Sinclair&apos;s shops from the printed pick list, marks exceptions on paper,
                  then rings the register. This marks the remaining{' '}
                  <b>{groceryItems.filter(i => i.shopping_status === 'pending').length} pending
                  line{groceryItems.filter(i => i.shopping_status === 'pending').length === 1 ? '' : 's'}</b>
                  {' '}shopped as ordered. Out-of-stock and substitutions you already keyed stay as they are.
                </p>
                {finishError && <p className="text-sm text-red-600">{finishError}</p>}
                <div className="flex flex-col-reverse sm:flex-row flex-wrap gap-2 sm:justify-end">
                  <button type="button" className="btn-outline text-sm px-3 py-2.5 w-full sm:w-auto" disabled={fillingAll}
                    onClick={() => setFinishStep(null)}>Cancel</button>
                  <button type="button" className="btn-primary text-sm px-3 py-2.5 w-full sm:w-auto flex items-center justify-center gap-1.5" disabled={fillingAll}
                    onClick={acceptAsOrdered}>
                    {fillingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Accept as ordered
                  </button>
                </div>
              </>
            )}

            {finishStep === 'register' && (
              <>
                <h2 className="font-display text-lg font-bold text-brand-navy">What did the register ring?</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  System total is {formatCurrency(subtotal)}. The register is the amount this order bills from.
                </p>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Register total
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-sm font-bold text-gray-500">$</span>
                    <input
                      type="number" step="0.01" min="0" autoFocus
                      className="input-base text-lg font-display font-bold text-brand-navy"
                      value={registerTotal}
                      onChange={e => { setRegisterTotal(e.target.value); setRegisterSaved(false); }}
                      onKeyDown={e => { if (e.key === 'Enter') continueFromRegister(); }}
                    />
                  </div>
                </label>
                {deckItems.length > 0 && (
                  <label className="block text-xs font-bold text-teal-700 uppercase tracking-wide">
                    Deck register total
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-sm font-bold text-gray-500">$</span>
                      <input
                        type="number" step="0.01" min="0"
                        className="input-base text-lg font-display font-bold text-teal-900"
                        value={deckTotal}
                        onChange={e => { setDeckTotal(e.target.value); setDeckSaved(false); }}
                      />
                    </div>
                    <span className="normal-case font-normal text-[11px] text-teal-800">
                      Rung separately · system {formatCurrency(deckSubtotal)}
                    </span>
                  </label>
                )}
                {registerTotal.trim() && !Number.isNaN(parseFloat(registerTotal)) && Math.abs(parseFloat(registerTotal) - subtotal) > 1 && (
                  <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {parseFloat(registerTotal) > subtotal ? '+' : ''}
                    {formatCurrency(parseFloat(registerTotal) - subtotal)} vs the system total — that is fine if the register is right.
                  </p>
                )}
                {finishError && <p className="text-sm text-red-600">{finishError}</p>}
                <div className="flex flex-col-reverse sm:flex-row flex-wrap gap-2 sm:justify-end">
                  <button type="button" className="btn-outline text-sm px-3 py-2.5 w-full sm:w-auto"
                    onClick={() => setFinishStep('accept')}>Back</button>
                  <button type="button" className="btn-primary text-sm px-3 py-2.5 w-full sm:w-auto" onClick={continueFromRegister}>
                    Continue
                  </button>
                </div>
              </>
            )}

            {finishStep === 'shopped' && (
              <>
                <h2 className="font-display text-lg font-bold text-brand-navy">Mark this order Shopped?</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Pick list is done and the register rang{' '}
                  <b className="text-brand-navy">{formatCurrency(parseFloat(registerTotal) || 0)}</b>.
                  Shopped means Sinclair&apos;s is finished — GTS delivers next. You can leave it
                  In Progress if you still have a note to key.
                </p>
                {finishError && <p className="text-sm text-red-600">{finishError}</p>}
                <div className="flex flex-col-reverse sm:flex-row flex-wrap gap-2 sm:justify-end">
                  <button type="button" className="btn-outline text-sm px-3 py-2.5 w-full sm:w-auto" disabled={fillingAll}
                    onClick={() => finishShopping(false)}>
                    Not yet — stay In Progress
                  </button>
                  <button type="button" className="btn-primary text-sm px-3 py-2.5 w-full sm:w-auto flex items-center justify-center gap-1.5" disabled={fillingAll}
                    onClick={() => finishShopping(true)}>
                    {fillingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Mark Shopped
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-100 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-brand-navy">{icon}</span>
        {/* Rendered as text, never as HTML. This was dangerouslySetInnerHTML
            purely so "&amp;" displayed as "&" — every caller passes a hardcoded
            string, so nothing was exploitable today. But it is a loaded gun:
            the first time someone passes a vessel name or a product title
            through here it becomes stored XSS in the admin panel. Escaping the
            ampersand at the call site costs nothing and closes it for good. */}
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</h3>
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
