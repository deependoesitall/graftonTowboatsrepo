'use client';
// src/app/admin/page.tsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Package, Clock, CheckCircle2, TrendingUp,
  ShoppingBag, Lock, Eye, EyeOff, Loader2, ShoppingCart,
  Mail, Send, X, FileText, AlertTriangle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { AdminRole, AdminPermission, setAdminSession, setAdminUiState, fetchAdminSession, adminFetch } from '@/lib/admin-auth';
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
                placeholder="e.g. jennifer"
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
          {adminRole === 'owner' && <FinalEmailQueue />}

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

  async function send() {
    setSending(true); setError('');
    try {
      const res = await adminFetch(`/api/orders/${order.id}/send-shopped-email`, { method: 'POST' });
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
                src={preview === 'email' ? `/api/orders/${order.id}/email-preview` : `/api/orders/${order.id}/pdf`}
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
          <button onClick={send} disabled={sending || !sendTo}
            className="flex-1 py-2.5 rounded-xl bg-brand-green text-white text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-brand-gmed transition-colors disabled:opacity-50">
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              : <><Send className="w-4 h-4" /> {sendTo ? 'Send Final Email' : 'No Email on Order'}</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
