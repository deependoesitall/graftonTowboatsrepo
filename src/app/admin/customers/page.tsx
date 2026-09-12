'use client';
// src/app/admin/customers/page.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Lock, RefreshCw, FileText, ChevronDown, ChevronRight, RotateCcw,
  Search, Calendar, X, CheckCircle, AlertCircle, Loader2, Printer,
  Ship, KeyRound, Users, Trash2, Pencil,
} from 'lucide-react';
import Link from 'next/link';
import { vesselReportHtml } from '@/lib/vessel-report';
import { fetchAdminSession, canAccess, adminFetch, isGtsRole } from '@/lib/admin-auth';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatCurrency, formatDate, formatDateOnly } from '@/lib/utils';
import { CustomerLoginsPanel } from '@/components/admin/CustomerLoginsPanel';

interface VesselOrderItem {
  product_id: string | null;
  description: string;
  category: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  item_type: string | null;
}

interface VesselOrder {
  id: string;
  order_number: string;
  subtotal: number;
  status: string;
  created_at: string;
  customer_email: string | null;
  vessel_email?: string | null;
  vessel_name: string | null;
  vessel_type: string | null;
  terminal_name?: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  notes: string | null;
  eta: string | null;
  items: VesselOrderItem[];
}

interface Vessel {
  company_name: string; contact_name: string; phone: string;
  orderCount: number; totalSpent: number; avgOrderValue: number;
  mostOrdered: Array<{ description: string; qty: number }>;
  orders: VesselOrder[];
}
interface ReportData {
  vessels: Vessel[];
}

// ── Repeat Order Modal ────────────────────────────────────────────────────────
interface RepeatState {
  vessel: Vessel;
  order: VesselOrder;
}

function RepeatOrderModal({
  state,
  onClose,
  onSuccess,
}: {
  state: RepeatState;
  onClose: () => void;
  onSuccess: (orderNumber: string) => void;
}) {
  const { vessel, order } = state;

  // Only grocery items can be repeated
  const groceryItems = order.items.filter(i => i.item_type !== 'service');

  const [quantities, setQuantities] = useState<Record<number, number>>(() =>
    Object.fromEntries(groceryItems.map((item, idx) => [idx, item.quantity]))
  );
  const [email, setEmail] = useState(order.customer_email || '');
  const [vesselName, setVesselName] = useState(order.vessel_name || '');
  const [arrivalDate, setArrivalDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState(order.arrival_time || '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const activeItems = groceryItems.filter((_, idx) => quantities[idx] > 0);
  const total = activeItems.reduce((s, item, _) => {
    const idx = groceryItems.indexOf(item);
    return s + item.unit_price * (quantities[idx] ?? 0);
  }, 0);

  async function submit() {
    if (!email.trim()) { setError('Email is required to place the order.'); return; }
    if (activeItems.length === 0) { setError('Add at least one item.'); return; }
    setError('');
    setSubmitting(true);

    const body = {
      vessel: {
        company_name: vessel.company_name,
        contact_name: vessel.contact_name,
        phone: vessel.phone,
        email: email.trim(),
        vessel_name: vesselName || undefined,
        arrival_date: arrivalDate || undefined,
        arrival_time: arrivalTime || undefined,
        notes: notes || undefined,
      },
      items: activeItems.map(item => {
        const idx = groceryItems.indexOf(item);
        return {
          product_id: item.product_id ?? `repeat-${order.id}-${idx}`,
          description: item.description,
          category: item.category,
          pkg_size: null,
          uom: null,
          price: item.unit_price,
          quantity: quantities[idx],
        };
      }),
      services: {},
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Failed to place order.');
      } else {
        onSuccess(json.order?.order_number || json.order_number || '');
      }
    } catch (e: any) {
      setError(e?.message || 'Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-display font-bold text-brand-navy text-lg">Repeat Order</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              From {order.order_number} · {vessel.company_name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {/* Items */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Items</p>
            {groceryItems.length === 0 ? (
              <p className="text-sm text-gray-400">This order has no grocery items to repeat.</p>
            ) : (
              <div className="space-y-2">
                {groceryItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-brand-navy truncate">{item.description}</p>
                      <p className="text-xs text-gray-400">{formatCurrency(item.unit_price)} each</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setQuantities(q => ({ ...q, [idx]: Math.max(0, (q[idx] ?? 1) - 1) }))}
                        className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-sm font-bold transition-colors">
                        −
                      </button>
                      <span className="w-7 text-center text-sm font-bold text-brand-navy">{quantities[idx] ?? 0}</span>
                      <button
                        onClick={() => setQuantities(q => ({ ...q, [idx]: (q[idx] ?? 0) + 1 }))}
                        className="w-6 h-6 rounded-full bg-brand-river/20 hover:bg-brand-river/30 flex items-center justify-center text-sm font-bold text-brand-river transition-colors">
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Vessel info */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Delivery Info</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">
                  Customer Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Required for order confirmation"
                  className="input-base text-sm w-full"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Vessel Name</label>
                <input
                  type="text"
                  value={vesselName}
                  onChange={e => setVesselName(e.target.value)}
                  placeholder={order.vessel_name || vessel.company_name}
                  className="input-base text-sm w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Arrival Date</label>
                <input
                  type="date"
                  value={arrivalDate}
                  onChange={e => setArrivalDate(e.target.value)}
                  className="input-base text-sm w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Arrival Time</label>
                <input
                  type="time"
                  value={arrivalTime}
                  onChange={e => setArrivalTime(e.target.value)}
                  className="input-base text-sm w-full"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Any special instructions…"
                  className="input-base text-sm w-full resize-none"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg px-3 py-2.5 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-gray-400">{activeItems.length} items · </span>
            <span className="font-bold text-brand-navy">{formatCurrency(total)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-outline text-sm px-4 py-2">Cancel</button>
            <button
              onClick={submit}
              disabled={submitting || groceryItems.length === 0}
              className="bg-brand-orange text-white text-sm font-bold px-5 py-2 rounded-full hover:bg-brand-ored transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Place Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Success toast ─────────────────────────────────────────────────────────────
function SuccessBanner({ orderNumber, onClose }: { orderNumber: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-brand-green text-white rounded-2xl px-5 py-4 shadow-2xl flex items-start gap-3 max-w-sm">
      <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <p className="font-bold text-sm">Order placed!</p>
        <p className="text-xs text-white/80 mt-0.5">
          {orderNumber} is now in the admin orders queue.
        </p>
      </div>
      <button onClick={onClose} className="text-white/60 hover:text-white ml-2">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Preset ranges ─────────────────────────────────────────────────────────────
const PRESETS = [
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_30', label: 'Last 30 Days' },
  { key: 'this_year', label: 'This Year' },
  { key: 'all_time', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
] as const;

type PresetKey = typeof PRESETS[number]['key'];

function getPresetRange(preset: PresetKey, customFrom?: string, customTo?: string): { from: string; to: string; label: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  switch (preset) {
    case 'this_week': {
      const day = now.getDay();
      const diff = now.getDate() - day;
      const start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0);
      return { from: start.toISOString(), to: today.toISOString(), label: 'This Week' };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      return { from: start.toISOString(), to: today.toISOString(), label: 'This Month' };
    }
    case 'last_30': {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      return { from: start.toISOString(), to: today.toISOString(), label: 'Last 30 Days' };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
      return { from: start.toISOString(), to: today.toISOString(), label: 'This Year' };
    }
    case 'all_time': {
      const start = new Date(2000, 0, 1, 0, 0, 0);
      return { from: start.toISOString(), to: today.toISOString(), label: 'All Time' };
    }
    case 'custom': {
      const from = customFrom ? new Date(customFrom + 'T00:00:00').toISOString() : new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const to = customTo ? new Date(customTo + 'T23:59:59').toISOString() : today.toISOString();
      return { from, to, label: 'Custom Range' };
    }
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────
function isImportOrder(orderNumber: string) {
  return String(orderNumber).startsWith('IMP-');
}

export default function CustomersPage() {
  const router = useRouter();
  const [denied, setDenied] = useState(false);
  const [ready, setReady] = useState(false);
  const [canRemoveImport, setCanRemoveImport] = useState(false);
  const [canRemoveAny, setCanRemoveAny] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editOk, setEditOk] = useState('');
  const [editFrom, setEditFrom] = useState({ company_name: '', vessel_name: '', phone: '' });
  const [editIds, setEditIds] = useState<string[]>([]);
  const [editForm, setEditForm] = useState({
    company_name: '',
    vessel_name: '',
    contact_name: '',
    phone: '',
    terminal_name: '',
    customer_email: '',
    vessel_email: '',
  });

  const [preset, setPreset] = useState<PresetKey>('all_time');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const [vesselSearch, setVesselSearch] = useState('');
  const [expandedVessel, setExpandedVessel] = useState<string | null>(null);

  const [repeatState, setRepeatState] = useState<RepeatState | null>(null);
  const [successOrderNumber, setSuccessOrderNumber] = useState<string | null>(null);

  const [panel, setPanel] = useState<'history' | 'logins'>('history');

  useEffect(() => {
    try {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab === 'logins') setPanel('logins');
    } catch { /* ignore */ }
  }, []);

  // Auth guard
  useEffect(() => {
    (async () => {
      const session = await fetchAdminSession();
      if (!session) { router.push('/admin'); return; }
      if (!canAccess(session.role, 'reports')) { setDenied(true); return; }
      setCanRemoveAny(session.role === 'owner');
      setCanRemoveImport(isGtsRole(session.role));
      setReady(true);
    })();
  }, [router]);

  const range = useMemo(() => getPresetRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const fetchReport = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const params = new URLSearchParams({ from: range.from, to: range.to });
    const res = await adminFetch(`/api/admin/reports?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [ready, range.from, range.to]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Was a raw vessels_report.csv download. Nobody opened it, and it wasn't
  // something you'd forward to a port captain. This builds the same data as a
  // branded sheet — same look as the monthly billing packet — previewed in-app
  // (house rule: no popup windows) with Print / Save as PDF.
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const reportFrameRef = useRef<HTMLIFrameElement>(null);

  function startEdit(key: string, v: Vessel) {
    const latest = v.orders[0];
    setEditingKey(key);
    setEditError('');
    setEditOk('');
    setEditFrom({
      company_name: v.company_name,
      vessel_name: latest?.vessel_name || '',
      phone: v.phone || '',
    });
    setEditIds(v.orders.map(o => o.id));
    setEditForm({
      company_name: v.company_name,
      vessel_name: latest?.vessel_name || '',
      contact_name: v.contact_name || '',
      phone: v.phone || '',
      terminal_name: latest?.terminal_name || '',
      customer_email: latest?.customer_email || '',
      vessel_email: latest?.vessel_email || '',
    });
  }

  async function saveEdit() {
    setEditSaving(true);
    setEditError('');
    setEditOk('');
    try {
      const res = await adminFetch('/api/admin/vessel-header', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: editFrom, to: editForm, ids: editIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(json.error || 'Could not save those names.');
        return;
      }
      setEditOk(`Updated ${json.updated} order${json.updated === 1 ? '' : 's'}. Next time this boat is picked, the spelling will be right.`);
      setEditingKey(null);
      fetchReport();
    } finally {
      setEditSaving(false);
    }
  }

  function canRemoveOrder(orderNumber: string) {
    return canRemoveAny || (canRemoveImport && isImportOrder(orderNumber));
  }

  async function removeOrder(orderId: string, orderNumber: string) {
    const imported = isImportOrder(orderNumber);
    if (!(await confirmDialog({
      title: imported
        ? `Remove imported order ${orderNumber}?`
        : `Permanently delete order ${orderNumber}?`,
      message: imported
        ? 'This was a staff import (no email was sent). It will drop off this boat’s history.'
        : 'This cannot be undone.',
      danger: true,
    }))) return;
    setDeletingId(orderId);
    const res = await adminFetch(`/api/orders/${orderId}`, { method: 'DELETE' });
    setDeletingId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      await confirmDialog({
        title: 'Could not remove that order',
        message: j.error || 'Try again in a moment.',
        actions: [{ id: 'ok', label: 'OK', variant: 'neutral' }],
      });
      return;
    }
    fetchReport();
  }

  async function removeImportedOnVessel(vessel: Vessel) {
    const imports = vessel.orders.filter(o => isImportOrder(o.order_number));
    if (!imports.length) return;
    if (!(await confirmDialog({
      title: `Remove ${imports.length} imported order${imports.length === 1 ? '' : 's'}?`,
      message: `Deletes ${imports.map(o => o.order_number).join(', ')} from this boat’s history. Real GTS orders are left alone.`,
      danger: true,
    }))) return;
    setDeletingId('bulk');
    for (const o of imports) {
      await adminFetch(`/api/orders/${o.id}`, { method: 'DELETE' });
    }
    setDeletingId(null);
    fetchReport();
  }

  function openVesselReport() {
    const rows = (data?.vessels || []).filter(v => v.orderCount > 0);
    const label = preset === 'custom'
      ? `${range.from} to ${range.to}`
      : (PRESETS.find(p => p.key === preset)?.label || 'All time');
    setReportHtml(vesselReportHtml(rows as never, label));
  }

  if (denied) return (
    <div className="flex flex-col items-center justify-center py-32 text-center px-4">
      <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4">
        <Lock className="w-6 h-6 text-red-400" />
      </div>
      <h2 className="font-bold text-brand-navy text-lg mb-1">Access Restricted</h2>
      <p className="text-gray-400 text-sm max-w-xs">
        Customer data is only available to Owner accounts. Contact an owner if you need this data.
      </p>
    </div>
  );

  const filteredVessels = data?.vessels.filter(v => {
    const q = vesselSearch.toLowerCase().trim();
    if (!q) return true;
    return v.company_name.toLowerCase().includes(q) ||
           v.contact_name.toLowerCase().includes(q) ||
           v.phone.toLowerCase().includes(q);
  }) || [];

  return (
    <div className="space-y-6">
      {confirmDialogEl}
      {repeatState && (
        <RepeatOrderModal
          state={repeatState}
          onClose={() => setRepeatState(null)}
          onSuccess={num => { setRepeatState(null); setSuccessOrderNumber(num); }}
        />
      )}
      {successOrderNumber && (
        <SuccessBanner orderNumber={successOrderNumber} onClose={() => setSuccessOrderNumber(null)} />
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-brand-navy">Customers &amp; boats</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            One place for boat customers, crew logins, and order history.
          </p>
          <p className="text-xs text-brand-green/70 mt-2 max-w-xl">
            Tip: Crew can also reset their own password from Sign in → Forgot password.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/customers/onboard"
            className="btn-primary text-sm px-4 py-2.5 flex items-center gap-2 shadow-sm">
            <Ship className="w-4 h-4" /> Add customer / boat
          </Link>
          {panel === 'history' && (
            <button onClick={fetchReport} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          )}
        </div>
      </div>

      {/* Segmented control */}
      <div className="inline-flex rounded-full bg-gray-100 p-1 gap-0.5">
        <button type="button" onClick={() => setPanel('history')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${
            panel === 'history' ? 'bg-brand-navy text-white shadow-sm' : 'text-gray-500 hover:text-brand-navy'
          }`}>
          <Users className="w-3.5 h-3.5" /> Boats / history
        </button>
        <button type="button" onClick={() => setPanel('logins')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${
            panel === 'logins' ? 'bg-brand-navy text-white shadow-sm' : 'text-gray-500 hover:text-brand-navy'
          }`}>
          <KeyRound className="w-3.5 h-3.5" /> Logins
        </button>
      </div>

      {panel === 'logins' && <CustomerLoginsPanel />}

      {panel === 'history' && (
        <>
      <div className="card-base p-4">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`px-3.5 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${
                preset === p.key ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="input-base text-xs py-1.5 w-36" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="input-base text-xs py-1.5 w-36" />
            </div>
          )}
          <span className="ml-auto text-xs text-gray-400">
            {formatDateOnly(range.from)} – {formatDateOnly(range.to)}
          </span>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-32">
          <RefreshCw className="w-6 h-6 animate-spin text-brand-river" />
        </div>
      ) : (
        <div className="card-base overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-display font-bold text-brand-navy">Customer / Vessel Lookup</h2>
            <button onClick={openVesselReport}
              disabled={!data?.vessels?.length}
              title="A branded, printable summary of what each barge line has ordered"
              className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40">
              <FileText className="w-3.5 h-3.5" /> Vessel Activity Report
            </button>
          </div>
          <div className="p-4 border-b border-gray-100">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="search" placeholder="Search vessel, company, contact, or phone…"
                value={vesselSearch} onChange={e => setVesselSearch(e.target.value)}
                className="input-base pl-9 text-sm" />
            </div>
          </div>
          {filteredVessels.length === 0 ? (
            <div className="p-10"><EmptyState text="No vessels match your search" /></div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredVessels.slice(0, 100).map(v => {
                const key = `${v.company_name}|${v.phone}`;
                const expanded = expandedVessel === key;
                return (
                  <div key={key}>
                    <button onClick={() => setExpandedVessel(expanded ? null : key)}
                      className="w-full flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left">
                      <div className="flex items-center gap-3 min-w-0">
                        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                        <div className="min-w-0">
                          <p className="font-semibold text-brand-navy text-sm truncate">{v.company_name}</p>
                          <p className="text-xs text-gray-400 truncate">{v.contact_name} · {v.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0 text-right">
                        <div>
                          <p className="text-xs text-gray-400">Orders</p>
                          <p className="font-bold text-brand-navy">{v.orderCount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Total Spent</p>
                          <p className="font-bold text-brand-navy">{formatCurrency(v.totalSpent)}</p>
                        </div>
                      </div>
                    </button>

                    {expanded && (
                      <div className="px-5 pb-5 bg-gray-50/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div className="bg-white rounded-xl border border-gray-100 p-4">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Most Ordered Items</h3>
                            {v.mostOrdered.length === 0 ? (
                              <p className="text-sm text-gray-400">No item data</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {v.mostOrdered.map(item => (
                                  <li key={item.description} className="flex justify-between text-sm">
                                    <span className="text-brand-navy truncate pr-2">{item.description}</span>
                                    <span className="font-bold text-gray-500 shrink-0">×{item.qty}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="bg-white rounded-xl border border-gray-100 p-4">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Account Summary</h3>
                            <div className="space-y-1.5 text-sm">
                              <div className="flex justify-between"><span className="text-gray-500">Avg Order Value</span><span className="font-bold text-brand-navy">{formatCurrency(v.avgOrderValue)}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Total Orders</span><span className="font-bold text-brand-navy">{v.orderCount}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Total Spent</span><span className="font-bold text-brand-navy">{formatCurrency(v.totalSpent)}</span></div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Boat details</h3>
                            {editingKey !== key && (
                              <button type="button" onClick={() => startEdit(key, v)}
                                className="text-[11px] font-bold uppercase tracking-wide text-brand-navy hover:text-brand-steel flex items-center gap-1">
                                <Pencil className="w-3.5 h-3.5" /> Edit names
                              </button>
                            )}
                          </div>
                          {editOk && editingKey !== key && (
                            <p className="text-xs text-emerald-700 mb-2">{editOk}</p>
                          )}
                          {editingKey === key ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {([
                                ['company_name', 'Company'],
                                ['vessel_name', 'Boat'],
                                ['contact_name', 'Contact'],
                                ['phone', 'Phone'],
                                ['terminal_name', 'Terminal / location'],
                                ['vessel_email', 'Vessel email'],
                                ['customer_email', 'Billing / confirmation email'],
                              ] as const).map(([field, label]) => (
                                <label key={field} className={`text-xs font-semibold text-gray-500 ${field.includes('email') || field === 'terminal_name' ? 'sm:col-span-2' : ''}`}>
                                  {label}
                                  <input
                                    className="input-base mt-1 text-sm font-normal text-brand-navy"
                                    value={editForm[field]}
                                    onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                                  />
                                </label>
                              ))}
                              {editError && <p className="sm:col-span-2 text-sm text-red-600">{editError}</p>}
                              <p className="sm:col-span-2 text-[11px] text-gray-400">
                                Saves spelling on this boat’s past orders so Build an order picks up the corrected names next time.
                              </p>
                              <div className="sm:col-span-2 flex gap-2">
                                <button type="button" className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5" disabled={editSaving} onClick={saveEdit}>
                                  {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save spelling'}
                                </button>
                                <button type="button" className="btn-outline text-sm px-3 py-1.5" disabled={editSaving}
                                  onClick={() => { setEditingKey(null); setEditError(''); }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                              <div><dt className="text-xs text-gray-400">Company</dt><dd className="font-medium text-brand-navy">{v.company_name}</dd></div>
                              <div><dt className="text-xs text-gray-400">Boat</dt><dd className="font-medium text-brand-navy">{v.orders[0]?.vessel_name || '—'}</dd></div>
                              <div><dt className="text-xs text-gray-400">Contact</dt><dd className="font-medium text-brand-navy">{v.contact_name || '—'}</dd></div>
                              <div><dt className="text-xs text-gray-400">Phone</dt><dd className="font-medium text-brand-navy">{v.phone || '—'}</dd></div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs text-gray-400">Terminal / location</dt>
                                <dd className="font-medium text-brand-navy">{v.orders[0]?.terminal_name || '—'}</dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs text-gray-400">Confirmation email</dt>
                                <dd className="font-medium text-brand-navy">{v.orders[0]?.vessel_email || v.orders[0]?.customer_email || '—'}</dd>
                              </div>
                            </dl>
                          )}
                        </div>

                        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                              Past Orders ({v.orders.length})
                            </h3>
                            {canRemoveImport && v.orders.some(o => isImportOrder(o.order_number)) && (
                              <button
                                type="button"
                                onClick={() => removeImportedOnVessel(v)}
                                disabled={deletingId === 'bulk'}
                                className="text-[11px] font-bold uppercase tracking-wide text-red-600 hover:text-red-700 disabled:opacity-40 flex items-center gap-1">
                                {deletingId === 'bulk'
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />}
                                Remove imports
                              </button>
                            )}
                          </div>
                          <div className="divide-y divide-gray-100">
                            {v.orders.slice(0, 20).map(o => (
                              <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                                <div className="min-w-0">
                                  <p className="font-mono text-xs font-bold text-brand-navy">
                                    {o.order_number}
                                    {isImportOrder(o.order_number) && (
                                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 rounded px-1.5 py-0.5">
                                        Import
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    {formatDate(o.created_at)} · {o.items.filter(i => i.item_type !== 'service').length} items
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-bold text-sm text-brand-navy">{formatCurrency(o.subtotal)}</span>
                                  <button
                                    onClick={() => setRepeatState({ vessel: v, order: o })}
                                    disabled={o.items.filter(i => i.item_type !== 'service').length === 0}
                                    className="flex items-center gap-1.5 bg-brand-orange text-white text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-full hover:bg-brand-ored transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                    <RotateCcw className="w-3.5 h-3.5" /> Repeat
                                  </button>
                                  {canRemoveOrder(o.order_number) && (
                                    <button
                                      type="button"
                                      onClick={() => removeOrder(o.id, o.order_number)}
                                      disabled={deletingId === o.id || deletingId === 'bulk'}
                                      title={isImportOrder(o.order_number) ? 'Remove this import' : 'Delete this order'}
                                      className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-40"
                                    >
                                      {deletingId === o.id
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <Trash2 className="w-4 h-4" />}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* In-app preview — PORTAL to body (house rule: every fixed overlay does,
          because animated ancestors trap position:fixed). Printing goes through
          the iframe so the browser prints the report, not the admin page. */}
      {reportHtml && createPortal(
        <div className="fixed inset-0 z-[95] bg-black/70 flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 bg-brand-navy text-white">
            <span className="font-display font-bold text-sm">Vessel Activity Report</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => reportFrameRef.current?.contentWindow?.print()}
                className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors">
                <Printer className="w-4 h-4" /> Print / Save PDF
              </button>
              <button onClick={() => setReportHtml(null)}
                className="text-white/80 hover:text-white flex items-center gap-1 text-sm">
                <X className="w-4 h-4" /> Close
              </button>
            </div>
          </div>
          <iframe ref={reportFrameRef} srcDoc={reportHtml} title="Vessel activity report"
            className="flex-1 w-full bg-white" />
        </div>,
        document.body,
      )}
        </>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
      {text}
    </div>
  );
}
