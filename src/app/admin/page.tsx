'use client';
// src/app/admin/page.tsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Package, Clock, CheckCircle2, TrendingUp,
  ShoppingBag, Lock, Eye, EyeOff, Loader2, ShoppingCart,
  Mail, Send, X, FileText, AlertTriangle, Truck,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { AdminRole, AdminPermission, setAdminSession, setAdminUiState, fetchAdminSession, adminFetch, isGtsRole, getAdminRole } from '@/lib/admin-auth';
import { useConfirm } from '@/components/ui/ConfirmDialog';

export default function AdminDashboard() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [logging, setLogging] = useState(false);
  const [stats, setStats] = useState<null | {
    total: number;
    new: number;
    in_progress: number;
    fulfilled: number;
    total_revenue: number;
    recent: Array<{ order_number: string; company_name: string; subtotal: number; status: string; created_at: string }>;
  }>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const session = await fetchAdminSession();
      setLoggedIn(!!session);
      if (session) {
        setAdminRole(session.role);
        // Sinclair users skip the dashboard and go straight to orders
        if (session.permissions?.includes('sinclair')) {
          window.location.href = '/admin/orders';
          return;
        }
        fetchStats();
      }
    })();
  }, []);

  async function handleLogin() {
    setLogging(true);
    setLoginError('');
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(username.trim() ? { username: username.trim(), password } : { password }),
      });
      if (!res.ok) {
        setLoginError(username.trim() ? 'Invalid username or password.' : 'Incorrect password. Please try again.');
        return;
      }
      const { token, user } = await res.json();
      const permissions: AdminPermission[] = user?.permissions ?? [];
      if (token) {
        setAdminSession(token, user?.role || 'owner', user?.display_name || user?.username || 'Admin', user?.username || 'admin', permissions);
      } else {
        setAdminUiState(user?.role || 'owner', user?.display_name || user?.username || 'Admin', user?.username || 'admin');
      }
      // Sinclair users go directly to orders
      window.location.href = permissions.includes('sinclair') ? '/admin/orders' : '/admin';
    } finally {
      setLogging(false);
    }
  }

  async function fetchStats() {
    const res = await adminFetch('/api/admin/stats');
    if (res.ok) setStats(await res.json());
    else setLoggedIn(false);
  }

  if (loggedIn === null) {
    return <div className="min-h-[80vh] flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }

  if (!loggedIn) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="card-base w-full max-w-sm p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-brand-navy rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6 text-brand-gold" />
            </div>
            <h1 className="font-display text-xl font-bold text-brand-navy">Admin Login</h1>
            <p className="text-gray-400 text-sm mt-1">Grafton Towboat Services</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="label-base">Username <span className="text-gray-400 font-normal normal-case">(leave blank for default login)</span></label>
              <input
                type="text"
                className="input-base"
                placeholder=""
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div>
              <label className="label-base">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input-base pr-10"
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                />
                <button
                  onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {loginError && <p className="text-red-500 text-xs mt-1">{loginError}</p>}
            </div>
            <button
              onClick={handleLogin}
              disabled={logging || !password}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {logging ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {logging ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isStaff = adminRole === 'staff';

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-brand-navy">Dashboard</h1>
        <p className="text-gray-400 text-sm">Grafton Towboat Services · Order Management</p>
      </div>

      {stats && (
        <>
          {/* ── STAFF STAT CARDS ── */}
          {isStaff ? (
            <div className="grid grid-cols-3 gap-4 mb-8">
              <StatCard
                label="Orders to Shop"
                value={stats.new}
                icon={<ShoppingCart className="w-5 h-5 text-blue-500" />}
                color="bg-blue-50"
                action={() => router.push('/admin/orders?status=new')}
                highlight={stats.new > 0}
              />
              <StatCard
                label="In Progress"
                value={stats.in_progress}
                icon={<Clock className="w-5 h-5 text-amber-500" />}
                color="bg-amber-50"
                action={() => router.push('/admin/orders?status=in_progress')}
                highlight={stats.in_progress > 0}
              />
              <StatCard
                label="Fulfilled"
                value={stats.fulfilled}
                icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
                color="bg-green-50"
                action={() => router.push('/admin/orders?status=fulfilled')}
              />
            </div>
          ) : (
            /* ── OWNER / MANAGER STAT CARDS ── */
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Total Orders"
                value={stats.total}
                icon={<ShoppingBag className="w-5 h-5 text-brand-steel" />}
                color="bg-blue-50"
              />
              <StatCard
                label="New"
                value={stats.new}
                icon={<Package className="w-5 h-5 text-blue-500" />}
                color="bg-blue-50"
                action={() => router.push('/admin/orders?status=new')}
              />
              <StatCard
                label="In Progress"
                value={stats.in_progress}
                icon={<Clock className="w-5 h-5 text-yellow-500" />}
                color="bg-yellow-50"
                action={() => router.push('/admin/orders?status=in_progress')}
              />
              <StatCard
                label="Revenue"
                value={formatCurrency(stats.total_revenue)}
                icon={<TrendingUp className="w-5 h-5 text-green-500" />}
                color="bg-green-50"
                isString
              />
            </div>
          )}

          {/* ── FINAL EMAIL QUEUE — shopped orders awaiting the customer email.
              Owner-only: Sinclair's finishing the shopping isn't the end of the
              job (CODs, crew changes, pickups). GTS fires the final email when
              everything's truly done — with a preview step to catch errors
              (e.g. a substitution Sinclair's forgot to record). ── */}
          {/* GTS only. The final email carries delivery charges and customer
              billing terms, so this is Grafton Towboat's step — not Sinclair's.
              Was owner-only; GTS Manager needs it too. */}
          {isGtsRole(adminRole) && <FinalEmailQueue />}

          {/* ── RECENT ORDERS ── */}
          <div className="card-base overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-brand-navy">
                {isStaff ? 'Orders Needing Attention' : 'Recent Orders'}
              </h2>
              <button
                onClick={() => router.push(isStaff ? '/admin/orders?status=new' : '/admin/orders')}
                className="text-brand-river text-sm hover:underline"
              >
                {isStaff ? 'View All New →' : 'View All →'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Order</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Vessel</th>
                    {!isStaff && (
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Total</th>
                    )}
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.recent.map(order => (
                    <tr
                      key={order.order_number}
                      className="admin-row cursor-pointer"
                      onClick={() => router.push(`/admin/orders?search=${order.order_number}`)}
                    >
                      <td className="px-4 py-3 font-mono text-sm font-bold text-brand-navy">
                        {order.order_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{order.company_name}</td>
                      {!isStaff && (
                        <td className="px-4 py-3 text-sm font-bold">{formatCurrency(order.subtotal)}</td>
                      )}
                      <td className="px-4 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label, value, icon, color, action, isString, highlight,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  action?: () => void;
  isString?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`card-base p-4 transition-shadow ${
        action ? 'cursor-pointer hover:shadow-md' : ''
      } ${highlight ? 'ring-2 ring-brand-gold/40' : ''}`}
      onClick={action}
    >
      <div className={`w-9 h-9 ${color} rounded-lg flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="font-display text-2xl font-bold text-brand-navy">
        {isString ? value : (value as number).toLocaleString()}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    fulfilled: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = {
    new: 'New',
    in_progress: 'In Progress',
    fulfilled: 'Fulfilled',
    cancelled: 'Cancelled',
  };
  return (
    <span className={`status-badge ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FINAL EMAIL QUEUE — the one manual step GTS keeps on purpose.
// Sinclair's marking an order Fulfilled means the GROCERIES are done; CODs,
// crew changes, and pickups may still be open. When everything's truly
// wrapped, a GTS owner sends the final "Order Shopped" email from here —
// one click, with a confirm dialog and an email/receipt preview that catches
// errors (unrecorded substitutions, missing weights) before the customer sees them.
// ─────────────────────────────────────────────────────────────────────────────

interface QueueOrder {
  id: string;
  order_number: string;
  company_name: string;
  vessel_name: string | null;
  subtotal: number;
  status: string;
  updated_at: string;
  vessel_email: string | null;
  customer_email: string | null;
  shopped_email_sent_at: string | null;
  register_total: number | null;
  sinclairs_receipt_url: string | null;
}

function FinalEmailQueue() {
  const [orders, setOrders] = useState<QueueOrder[] | null>(null);
  const [confirmOrder, setConfirmOrder] = useState<QueueOrder | null>(null);
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();

  async function load() {
    const res = await adminFetch('/api/orders?status=fulfilled&per_page=50');
    if (!res.ok) { setOrders([]); return; }
    const data = await res.json();
    setOrders(((data.orders || []) as QueueOrder[]).filter(o => !o.shopped_email_sent_at));
  }
  useEffect(() => { load(); }, []);

  // Clear an order from the queue WITHOUT emailing — for orders with no email
  // on file, or ones handled by phone. Stamps who dismissed it (audit trail).
  async function dismiss(o: QueueOrder) {
    if (!(await confirmDialog({
      title: `Remove ${o.order_number} without sending an email?`,
      message: 'Use this when the order has no email on file, or you already handled it by phone. It will be recorded as dismissed.',
      danger: true,
    }))) return;
    await adminFetch(`/api/orders/${o.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopped_email_sent_at: new Date().toISOString(),
        shopped_email_sent_by: 'dismissed — no email sent',
      }),
    });
    load();
  }

  if (!orders || orders.length === 0) return null; // quiet when there's nothing to send

  return (
    <div className="card-base overflow-hidden mb-6 border-2 border-brand-gold/40">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-brand-sand/30">
        <h2 className="font-display text-lg font-bold text-brand-navy flex items-center gap-2">
          <Mail className="w-5 h-5 text-brand-gold" />
          Shopped — awaiting final email
          <span className="text-xs font-bold bg-brand-gold text-brand-navy rounded-full px-2 py-0.5">{orders.length}</span>
        </h2>
        <p className="text-xs text-gray-400 hidden sm:block">Send once CODs, crew changes &amp; pickups are wrapped up</p>
      </div>
      <div className="divide-y divide-gray-100">
        {orders.map(o => {
          const regDiff = o.register_total != null
            ? Math.abs(o.register_total - o.subtotal) > 1
            : false;
          return (
          <div key={o.id} className="px-6 py-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[180px]">
              <p className="font-mono font-bold text-brand-navy text-sm">{o.order_number}</p>
              <p className="text-xs text-gray-500">
                {o.vessel_name || o.company_name}{o.vessel_name ? ` · ${o.company_name}` : ''} · {formatCurrency(o.subtotal)}
              </p>
              {regDiff && (
                <p className="text-xs font-bold text-amber-700 mt-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Register total {formatCurrency(o.register_total!)} vs system {formatCurrency(o.subtotal)} — confirm which to bill
                </p>
              )}
            </div>
            <p className="text-xs text-gray-400 hidden md:block">
              to {o.vessel_email || o.customer_email || <span className="text-red-500 font-semibold">no email on order</span>}
            </p>
            <button
              onClick={() => setConfirmOrder(o)}
              className="flex items-center gap-1.5 bg-brand-navy text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-lg hover:bg-brand-steel transition-colors">
              <Send className="w-3.5 h-3.5" /> Send Final Email
            </button>
            <button
              onClick={() => dismiss(o)}
              title="Remove from this list without sending (e.g. no email on the order, or handled by phone)"
              className="text-gray-300 hover:text-red-400 transition-colors p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        );})}
      </div>

      {confirmOrder && (
        <SendFinalEmailDialog
          order={confirmOrder}
          onClose={() => setConfirmOrder(null)}
          onSent={() => { setConfirmOrder(null); load(); }}
        />
      )}
      {confirmDialogEl}
    </div>
  );
}

function SendFinalEmailDialog({ order, onClose, onSent }: {
  order: QueueOrder; onClose: () => void; onSent: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<null | 'email' | 'receipt'>(null);
  const sendTo = order.vessel_email || order.customer_email;

  // ── GTS delivery billing — rides on this final email as a line item ──
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [serviceTypes, setServiceTypes] = useState<Array<{ id: string; name: string; default_rate: number }>>([]);
  const [companyId, setCompanyId] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [fee, setFee] = useState('');
  const [billGroceries, setBillGroceries] = useState(true);
  const [rateHint, setRateHint] = useState('');
  // Delivery terms are GTS's business, not Sinclair's. Same gate as the
  // Deliveries page ('reports'), which staff don't have. Read after mount so
  // the server and client first render agree (localStorage isn't available
  // during SSR — reading it in useState caused hydration errors before).
  const [isGts, setIsGts] = useState(false);
  useEffect(() => { setIsGts(isGtsRole(getAdminRole())); }, []);
  // Grocery billing: Sinclair's actual receipt total + the receipt PDF itself.
  const [groceryTotal, setGroceryTotal] = useState(order.register_total != null ? String(order.register_total) : '');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(order.sinclairs_receipt_url);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  async function uploadReceipt(file: File) {
    setUploadingReceipt(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'receipt');
      const res = await adminFetch(`/api/orders/${order.id}/documents`, { method: 'POST', body: fd });
      const r = await res.json();
      if (!res.ok) throw new Error(r?.error || 'Upload failed');
      setReceiptUrl(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingReceipt(false);
    }
  }

  // Load barge lines + service types; default the company to the order's.
  useEffect(() => {
    (async () => {
      const [c, s] = await Promise.all([
        adminFetch('/api/admin/companies'),
        adminFetch('/api/admin/service-rates'),
      ]);
      const comps = c.ok ? (await c.json()).companies : [];
      const svcs = s.ok ? (await s.json()).service_types : [];
      setCompanies(comps);
      setServiceTypes(svcs);
      // Best-effort match of the order's company name to a barge line.
      const oc = (order.company_name || '').toLowerCase().trim();
      const match = comps.find((x: { name: string }) => oc && (x.name.toLowerCase() === oc || oc.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(oc)));
      if (match) setCompanyId(match.id);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fill the fee from the chosen company's rate card when both are set.
  const svcId = serviceTypes.find(s => s.name === serviceType)?.id;
  useEffect(() => {
    if (!companyId || !svcId) { setRateHint(''); return; }
    let cancelled = false;
    adminFetch(`/api/admin/service-rates?company_id=${companyId}&service_type_id=${svcId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d || d.rate == null) return;
        setRateHint(`${d.is_override ? "this company's rate" : 'default rate'}: $${Number(d.rate).toFixed(2)}`);
        setFee(prev => prev === '' ? String(d.rate) : prev);
      });
    return () => { cancelled = true; };
  }, [companyId, svcId]);

  // Query params so the email preview reflects the live delivery choice.
  const previewQuery = new URLSearchParams();
  if (fee !== '') previewQuery.set('delivery_fee', fee);
  if (serviceType) previewQuery.set('delivery_service_type', serviceType);
  previewQuery.set('bill_for_groceries', String(billGroceries));
  if (billGroceries && groceryTotal !== '') previewQuery.set('register_total', groceryTotal);
  const emailPreviewSrc = `/api/orders/${order.id}/email-preview?${previewQuery.toString()}`;

  // Grocery-billed orders can't go out on an estimate — they need Sinclair's
  // actual receipt total AND the receipt PDF to ride along.
  const [overrideReceipt, setOverrideReceipt] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const missingGroceryDocs = billGroceries && (groceryTotal === '' || !receiptUrl);
  const needsGroceryDocs = missingGroceryDocs && !overrideReceipt;

  async function send() {
    setSending(true); setError('');
    try {
      const res = await adminFetch(`/api/orders/${order.id}/send-shopped-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_fee: fee === '' ? null : Number(fee),
          delivery_service_type: serviceType || null,
          delivery_company_id: companyId || null,
          bill_for_groceries: billGroceries,
          register_total: billGroceries && groceryTotal !== '' ? Number(groceryTotal) : undefined,
        }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r?.error || 'Email failed to send');
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email failed to send');
    } finally {
      setSending(false);
    }
  }

  // PORTAL to <body>: the queue card animates with a transform, which traps
  // position:fixed descendants inside it (the dialog rendered wedged into the
  // card and couldn't be dismissed). Portaling escapes any ancestor styling.
  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className={`bg-white rounded-2xl shadow-2xl w-full flex flex-col max-h-[92vh] transition-all ${preview ? 'max-w-4xl' : 'max-w-md'}`}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-brand-navy">Send the final order email?</h3>
              <p className="text-xs text-gray-500">
                {order.order_number} · {order.vessel_name || order.company_name} ·{' '}
                {sendTo ? <>to <strong>{sendTo}</strong></> : <span className="text-red-500 font-semibold">no email on this order</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {!preview && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed mb-4">
              <strong>Before you send, double-check the order:</strong> substitutions recorded? Actual weights entered?
              CODs, crew changes and pickups wrapped up? If Sinclair&apos;s shopped from a printed list, changes they
              made on paper might not be in the system yet — preview below to catch that first.
            </div>
          )}

          {/* GTS delivery charge — goes on this final email as a line item.
              GTS-ONLY. Delivery service types, barge lines and rate cards are
              Grafton Towboat's commercial terms with the boat company —
              Sinclair's has no part in setting them and must not see them.
              The Dashboard is visible to every role (area: null in AdminNav),
              so this block gates on the same permission as the Deliveries
              page: 'reports', which staff do not have. Sinclair's still gets
              the grocery total and receipt upload below — their actual job. */}
          {!preview && isGts && (
            <div className="border border-brand-navy/20 rounded-xl p-3 mb-4">
              <p className="text-xs font-bold text-brand-navy uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" /> Delivery charge on this bill
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-500">Barge line</span>
                  <select value={companyId} onChange={e => setCompanyId(e.target.value)}
                    className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                    <option value="">—</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-500">Service type</span>
                  <select value={serviceType} onChange={e => setServiceType(e.target.value)}
                    className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                    <option value="">—</option>
                    {serviceTypes.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="block mt-2">
                <span className="text-[11px] font-semibold text-gray-500">
                  Delivery fee {rateHint && <span className="text-brand-green font-normal">· {rateHint}</span>}
                </span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-gray-400 text-sm">$</span>
                  <input type="number" step="0.01" min="0" placeholder="0.00" value={fee}
                    onChange={e => setFee(e.target.value)}
                    className="w-32 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                </div>
              </label>
              <label className="flex items-start gap-2 mt-2.5 text-xs cursor-pointer">
                <input type="checkbox" checked={billGroceries} onChange={e => setBillGroceries(e.target.checked)}
                  className="w-4 h-4 accent-brand-navy mt-0.5" />
                <span>
                  <span className="font-semibold text-brand-navy">Bill groceries on this invoice</span>
                  <span className="block text-gray-400">
                    On: Sinclair&apos;s grocery total + delivery = one final total. Off: customer pays Sinclair&apos;s directly, email shows delivery charge only.
                  </span>
                </span>
              </label>

              {/* Grocery-billed orders REQUIRE Sinclair's actual receipt total
                  + the receipt PDF — the email can't go out on an estimate. */}
              {billGroceries && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2.5">
                  <label className="block">
                    <span className="text-[11px] font-semibold text-gray-500">Sinclair&apos;s grocery total (from their receipt)</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-gray-400 text-sm">$</span>
                      <input type="number" step="0.01" min="0" placeholder="0.00" value={groceryTotal}
                        onChange={e => setGroceryTotal(e.target.value)}
                        className="w-32 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                  </label>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500">Sinclair&apos;s register receipt (PDF)</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <label className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                        receiptUrl ? 'border-green-300 bg-green-50 text-green-700' : 'border-brand-navy/30 text-brand-navy hover:bg-gray-50'
                      }`}>
                        {uploadingReceipt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                        {receiptUrl ? 'Receipt attached — replace' : 'Attach receipt'}
                        <input type="file" accept="application/pdf,image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadReceipt(f); }} />
                      </label>
                      {receiptUrl && (
                        <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-river underline">View</a>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      It rides along with the final email so the customer gets Sinclair&apos;s exact prices, line by line.
                    </p>
                  </div>
                  {missingGroceryDocs && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      Enter the grocery total and attach Sinclair&apos;s receipt before sending, or turn off &ldquo;Bill groceries.&rdquo;
                      {/* Deliberate owner-only override — small on purpose, and it
                          takes an explicit tick so it can't happen by accident. */}
                      {!showOverride ? (
                        <button type="button" onClick={() => setShowOverride(true)}
                          className="block mt-1 text-[10px] text-gray-400 underline underline-offset-2 hover:text-gray-600">
                          Owner: send without the receipt
                        </button>
                      ) : (
                        <label className="flex items-start gap-1.5 mt-1.5 text-[10px] text-red-700 cursor-pointer">
                          <input type="checkbox" checked={overrideReceipt}
                            onChange={e => setOverrideReceipt(e.target.checked)}
                            className="w-3 h-3 accent-red-600 mt-0.5" />
                          <span>I&apos;m sending this grocery bill <strong>without</strong> Sinclair&apos;s receipt attached, on purpose.</span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Preview toggles */}
          <div className="flex gap-2 mb-3">
            <button onClick={() => setPreview(p => p === 'email' ? null : 'email')}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border transition-colors ${
                preview === 'email' ? 'bg-brand-navy text-white border-brand-navy' : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>
              <Eye className="w-3.5 h-3.5" /> Preview Email
            </button>
            <button onClick={() => setPreview(p => p === 'receipt' ? null : 'receipt')}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border transition-colors ${
                preview === 'receipt' ? 'bg-brand-navy text-white border-brand-navy' : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>
              <FileText className="w-3.5 h-3.5" /> Preview Receipt
            </button>
          </div>

          {preview && (
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50" style={{ height: '52vh' }}>
              <iframe
                src={preview === 'email' ? emailPreviewSrc : `/api/orders/${order.id}/pdf`}
                title={preview === 'email' ? 'Email preview' : 'Receipt preview'}
                className="w-full h-full bg-white"
              />
            </div>
          )}
          {preview && (
            <p className="text-[11px] text-gray-400 mt-2">
              Something off? Close this, fix the order (substitutions, weights, quantities), then come back and send.
            </p>
          )}

          {error && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose} disabled={sending}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={send} disabled={sending || !sendTo || needsGroceryDocs}
            className="flex-1 py-2.5 rounded-xl bg-brand-green text-white text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-brand-gmed transition-colors disabled:opacity-50">
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              : <><Send className="w-4 h-4" /> {!sendTo ? 'No Email on Order' : needsGroceryDocs ? 'Receipt Needed' : 'Send Final Email'}</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
