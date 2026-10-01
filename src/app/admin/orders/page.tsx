'use client';
// src/app/admin/orders/page.tsx
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Download, Eye, Loader2, RefreshCw, Package, ArrowRight, Trash2, Users, Wrench, Printer, Plus, Mail, MailX, MailCheck, CheckCircle2, MapPin, Truck, PackageCheck } from 'lucide-react';
import { PickSheetOverlay } from '@/components/admin/PickSheetOverlay';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatCurrency, formatDate, orderItemCount, ORDER_STATUSES } from '@/lib/utils';
import { Order, OrderStatus, OrderHandoff } from '@/types';
import { OrderDetailModal } from '@/components/admin/OrderDetailModal';
import { ShoppingModeModal } from '@/components/admin/ShoppingModeModal';
import { fetchAdminSession, getAdminRole, canEdit, adminFetch, hasAdminPermission, isGtsRole } from '@/lib/admin-auth';
import PushBell from '@/components/admin/PushBell';

const STATUS_CONFIG = {
  new:         { label: 'New',         bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',  dot: 'bg-blue-500',  edge: 'border-l-blue-500'  },
  in_progress: { label: 'In Progress', bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200', dot: 'bg-amber-500', edge: 'border-l-amber-500' },
  shopped:     { label: 'Shopped',     bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200',dot: 'bg-purple-500',edge: 'border-l-purple-500'},
  fulfilled:   { label: 'Fulfilled',   bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200', dot: 'bg-green-500', edge: 'border-l-green-500' },
  cancelled:   { label: 'Cancelled',   bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200',   dot: 'bg-red-400',   edge: 'border-l-red-400'   },
} as const;

function StatusBadge({ status, onClick }: { status: string; onClick?: () => void }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? { label: status, bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border} ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </button>
  );
}

/**
 * WHERE A SHOPPED ORDER PHYSICALLY IS — a second axis, not a status.
 *
 * After the register, one of two things happens and until Sep 2026 the system
 * recorded neither: Sinclair's runs the order down to the GTS walk-in coolers
 * in Grafton, or it stays boxed at the store for a GTS driver to collect. With
 * nothing written down, an order could sit at Sinclair's overnight with both
 * businesses assuming the other had it.
 *
 * Staff-only. Never rendered on the customer order view or in any boat email.
 */
const HANDOFF_CONFIG = {
  delivered_to_gts: {
    /** On Sinclair's button — written from THEIR side of the counter. */
    button: 'Delivered to GTS',
    /** On GTS's badge — written as the thing Jen needs to know. */
    badge: 'At Grafton',
    /** Plain sentence. Tooltip on desktop, printed under the buttons on phones. */
    help: 'We drove it down to the GTS coolers in Grafton.',
    bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300',
    idle: 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 hover:border-emerald-500 hover:shadow-sm',
    selected: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25',
    dim: 'bg-white text-emerald-800/70 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-400',
    toast: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    Icon: Truck,
  },
  awaiting_gts_pickup: {
    button: 'Ready for Pickup',
    badge: 'Needs pickup',
    help: "It's boxed up at Sinclair's. A GTS driver needs to come get it.",
    bg: 'bg-orange-50', text: 'text-orange-900', border: 'border-orange-300',
    idle: 'bg-orange-50 text-brand-orange border-orange-300 hover:bg-orange-100 hover:border-brand-orange hover:shadow-sm',
    selected: 'bg-brand-orange text-white border-brand-orange shadow-md shadow-orange-500/30',
    dim: 'bg-white text-brand-orange/70 border-orange-200 hover:bg-orange-50 hover:border-orange-400',
    toast: 'border-orange-300 bg-orange-50 text-orange-900',
    Icon: PackageCheck,
  },
} as const;

const HANDOFF_KEYS = Object.keys(HANDOFF_CONFIG) as OrderHandoff[];

/** What GTS sees. The notification says an order is waiting; this is how Jen
 *  tells WHICH one once she opens the list. */
function HandoffBadge({ handoff, at, by }: { handoff: OrderHandoff; at?: string | null; by?: string | null }) {
  const c = HANDOFF_CONFIG[handoff];
  const when = at ? new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <span
      title={[c.help, when, by ? `Marked by ${by}` : ''].filter(Boolean).join(' · ')}
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}
    >
      <c.Icon className="w-2.5 h-2.5" /> {c.badge}
    </span>
  );
}

/** What Sinclair's sees, on shopped orders only. Both buttons stay live so a
 *  wrong tap is corrected by pressing the other one, not by calling Jen. */
function HandoffButtons({
  value, busy, busyValue, onSet, wide,
}: {
  value?: OrderHandoff | null;
  busy: boolean;
  busyValue?: OrderHandoff | null;
  onSet: (v: OrderHandoff) => void;
  wide?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Where this order went"
      className={`items-stretch gap-1.5 p-1 rounded-xl bg-slate-50 border border-slate-200/90 ${
        wide ? 'flex w-full' : 'inline-flex'
      }`}
    >
      {HANDOFF_KEYS.map(k => {
        const c = HANDOFF_CONFIG[k];
        const on = value === k;
        const otherOn = !!value && !on;
        const spinning = busy && busyValue === k;
        return (
          <button
            key={k}
            type="button"
            disabled={busy}
            onClick={e => { e.stopPropagation(); onSet(k); }}
            title={c.help}
            aria-pressed={on}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide border transition-all duration-150 disabled:opacity-50 whitespace-nowrap ${
              wide ? 'flex-1 min-w-0' : ''
            } ${on ? c.selected : otherOn ? c.dim : c.idle}`}
          >
            {spinning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <c.Icon className="w-3.5 h-3.5 shrink-0" />}
            {c.button}
            {on && !spinning && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

// Pipeline: next status after current
// new → in_progress → shopped (Sinclair's rang it up) → fulfilled (GTS delivered)
//
// Sinclair's pipeline STOPS at 'shopped'. 'fulfilled' means Grafton delivered
// and sent the customer their final email — which carries GTS's delivery fee
// and billing terms. Sinclair's never sees that email and doesn't control the
// delivery, so the chain simply ends for them. The server rejects it too; this
// only stops the button existing.
function nextStatus(current: string, isGts: boolean): OrderStatus | null {
  switch (current) {
    case 'new':         return 'in_progress';
    case 'in_progress': return 'shopped';
    case 'shopped':     return isGts ? 'fulfilled' : null;
    default:            return null;
  }
}

function OrdersContent() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  useEffect(() => {
    const st = new URLSearchParams(window.location.search).get('status');
    if (st) setStatusFilter(st);
  }, []);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [deepLinkShop, setDeepLinkShop] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Role-gated UI is resolved AFTER mount — reading localStorage during render
  // makes the client's first paint differ from the server HTML (hydration #418).
  const [roleFlags, setRoleFlags] = useState({ canEditOrders: false, isOwner: false, isSinclair: false, isGts: false });
  useEffect(() => {
    setRoleFlags({
      canEditOrders: canEdit(getAdminRole(), 'orders'),
      isOwner: getAdminRole() === 'owner',
      // Only GTS may advance an order to 'fulfilled' — see nextStatus().
      isGts: isGtsRole(getAdminRole()),
      // Mirrors the server's isSinclairScoped(): every Sinclair's role is
      // grocery-scoped by definition, never by opt-in checkbox.
      isSinclair: !isGtsRole(getAdminRole()) || hasAdminPermission('sinclair'),
    });
  }, []);
  const { canEditOrders, isOwner, isSinclair, isGts } = roleFlags;
  const canDeleteOrder = (orderNumber: string) =>
    isOwner || (isGts && String(orderNumber).startsWith('IMP-'));
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Auth guard — verify the session cookie with the server
  useEffect(() => {
    (async () => {
      const session = await fetchAdminSession();
      if (!session) router.push('/admin');
    })();
  }, [router]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('per_page', '25');
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);

    const res = await adminFetch(`/api/orders?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      const fetchedOrders: Order[] = [...(data.orders || [])].sort((a, b) => {
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        return tb - ta;
      });
      setOrders(fetchedOrders);
      setTotal(data.total || 0);
      setStatusCounts(data.status_counts || {});
    }
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // DEEP LINK FROM A PUSH NOTIFICATION — /admin/orders?order=<id>
  //
  // Read straight off window.location rather than useSearchParams(): that hook
  // forces the whole page into a Suspense boundary at build time, and this is a
  // one-shot read that doesn't need to re-render on navigation.
  //
  // Fires only once, and only when the id actually matches something loaded.
  // A notification for an order that's since been deleted, cancelled, or
  // filtered out simply lands on the list — never an error, never an empty
  // modal. Consumed from the URL afterwards so a refresh doesn't reopen it
  // over whatever the person moved on to.
  const [deepLinkDone, setDeepLinkDone] = useState(false);
  const [placedNote, setPlacedNote] = useState<{ number: string; email: string } | null>(null);
  useEffect(() => {
    if (deepLinkDone) return;
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get('order');
    const wantShop = params.get('shop') === '1';
    const placed = params.get('placed') === '1';
    const emailFlag = params.get('email') || '';
    if (!wanted) { setDeepLinkDone(true); return; }

    const match = orders.find(o => o.id === wanted);
    if (match) {
      setSelectedOrder(match);
      if (wantShop) setDeepLinkShop(true);
      if (placed) setPlacedNote({ number: match.order_number, email: emailFlag });
      setDeepLinkDone(true);
      window.history.replaceState({}, '', '/admin/orders');
      return;
    }
    if (loading) return;

    let cancelled = false;
    (async () => {
      const res = await adminFetch(`/api/orders/${wanted}`);
      if (cancelled) return;
      if (res.ok) {
        const o = await res.json();
        setSelectedOrder(o);
        if (wantShop) setDeepLinkShop(true);
        if (placed) setPlacedNote({ number: o.order_number, email: emailFlag });
      }
      setDeepLinkDone(true);
      window.history.replaceState({}, '', '/admin/orders');
    })();
    return () => { cancelled = true; };
  }, [orders, deepLinkDone, loading]);

  async function advanceStatus(order: Order) {
    const next = nextStatus(order.status, roleFlags.isGts);
    if (!next) return;
    setUpdatingId(order.id);
    await adminFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    await fetchOrders();
    setUpdatingId(null);
    // Update selected order if open
    if (selectedOrder?.id === order.id) {
      setSelectedOrder(prev => prev ? { ...prev, status: next } : null);
    }
  }

  // Sinclair's marking where a shopped order went. Separate from updatingId so
  // the pipeline button and these don't disable each other.
  const [handoffPending, setHandoffPending] = useState<{ id: string; value: OrderHandoff } | null>(null);
  const [handoffError, setHandoffError] = useState('');
  const [handoffOk, setHandoffOk] = useState<{ kind: OrderHandoff; text: string } | null>(null);
  async function setHandoff(order: Order, next: OrderHandoff) {
    if (order.handoff === next) return;
    setHandoffPending({ id: order.id, value: next });
    setHandoffError('');
    setHandoffOk(null);
    try {
      const res = await adminFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handoff: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        // Surfaced, not swallowed. If this fails and the row looks unchanged,
        // Sinclair's needs to know the alert never went out.
        setHandoffError(j.error || 'Could not save that. Grafton has NOT been told.');
      } else {
        await fetchOrders();
        // Sinclair's gets no push and no email — this line is the only
        // confirmation they get that Grafton actually heard them.
        setHandoffOk({
          kind: next,
          text: next === 'delivered_to_gts'
            ? `Order ${order.order_number} marked Delivered to GTS. Grafton has been notified.`
            : `Order ${order.order_number} marked Ready for Pickup. Grafton has been notified to come get it.`,
        });
        window.setTimeout(() => setHandoffOk(null), 6000);
      }
    } finally {
      setHandoffPending(null);
    }
  }

  // Barcode pick sheet straight from the list, shown IN-APP (no pop-ups).
  // Opening a NEW order prompts to lock it In Progress first (declinable —
  // Dave prints future orders early).
  const [pickSheetOrder, setPickSheetOrder] = useState<{ id: string; number: string } | null>(null);
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm();
  async function printPickSheet(order: Order) {
    if (canEditOrders && order.status === 'new') {
      const choice = await confirmDialog({
        title: 'Mark as In Progress before printing?',
        message: 'In Progress locks the order — the customer can no longer add or change items. Printing early for a future-day order? Choose Just Print and the customer can keep editing.',
        actions: [
          { id: 'lock', label: 'Mark In Progress & Print' },
          { id: 'print', label: 'Just Print', variant: 'neutral' },
        ],
      });
      if (!choice) return;
      if (choice === 'lock') await updateStatus(order.id, 'in_progress');
    }
    setPickSheetOrder({ id: order.id, number: order.order_number });
  }

  async function updateStatus(orderId: string, status: OrderStatus) {
    // Optimistic update so the modal dropdown reflects the change immediately
    setSelectedOrder(prev => prev && prev.id === orderId ? { ...prev, status } : prev);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));

    await adminFetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchOrders();
  }

  async function wipeImportTests() {
    if (!(await confirmDialog({
      title: 'Remove every IMP- test import on this page?',
      message: 'Only register-tape imports (IMP-…) are deleted. Real GTS- orders stay.',
      danger: true,
    }))) return;
    const imports = orders.filter(o => String(o.order_number).startsWith('IMP-'));
    for (const o of imports) {
      await adminFetch(`/api/orders/${o.id}`, { method: 'DELETE' });
    }
    if (selectedOrder && String(selectedOrder.order_number).startsWith('IMP-')) setSelectedOrder(null);
    fetchOrders();
  }

  async function deleteOrder(orderId: string, orderNumber: string) {
    if (!(await confirmDialog({
      title: `Permanently delete order ${orderNumber}?`,
      message: 'This cannot be undone.',
      danger: true,
    }))) return;
    setDeletingId(orderId);
    const res = await adminFetch(`/api/orders/${orderId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setOrders(prev => prev.filter(o => o.id !== orderId));
      if (selectedOrder?.id === orderId) setSelectedOrder(null);
    }
    setDeletingId(null);
  }

  function downloadOrderPdf(orderId: string, orderNumber: string) {
    window.open(`/api/orders/${orderId}/pdf`, '_blank');
  }

  const totalPages = Math.ceil(total / 25);

  return (
    <div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-brand-navy">Orders</h1>
            <p className="text-gray-400 text-sm">{total.toLocaleString()} total</p>
          </div>
          <div className="flex flex-wrap gap-2 self-start">
            {roleFlags.isGts && orders.some(o => String(o.order_number).startsWith('IMP-')) && (
              <button type="button" onClick={wipeImportTests}
                className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5 text-red-700 border-red-200 hover:bg-red-50">
                <Trash2 className="w-4 h-4" /> Remove IMP tests
              </button>
            )}
            {/* THE MISSING DOOR.
                There was no way to create an order from inside admin at all —
                Jen's only route for a boat that phoned or faxed was to open the
                customer storefront and shop as if she were them. Paper orders
                are still most of the volume, so the absence of this button was
                the single biggest reason data stayed on paper. */}
            <button onClick={() => router.push('/admin/orders/new')}
                    className="btn-primary text-sm px-3 py-2 flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> New order
            </button>
            <button
              type="button"
              onClick={(e) => {
                fetchOrders();
                // Touch browsers keep :hover/:focus until tap-away — clear it.
                e.currentTarget.blur();
              }}
              className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        {placedNote && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-bold text-emerald-900">Placed {placedNote.number}</p>
              <p className="text-emerald-800/90 text-xs mt-0.5">
                {placedNote.email === 'skipped'
                  ? 'Boat confirmation was not sent — you can send it from this order if you want.'
                  : placedNote.email === 'failed'
                    ? 'The order saved, but the confirmation email failed. Check Resend, or send it from this screen.'
                    : 'Boat confirmation email was sent.'}
              </p>
            </div>
            <button type="button" className="text-xs font-bold text-emerald-800 shrink-0" onClick={() => setPlacedNote(null)}>Dismiss</button>
          </div>
        )}

        {/* ⚠️ ORDER ALERTS HAVE TO BE REACHABLE FROM HERE.
            Sinclair's sessions are redirected to /admin/orders the moment they
            sign in and never load the dashboard, so the one place that offered
            "Notify me of new orders" was unreachable for the only people whose
            job depends on hearing about an order. GTS roles still get it on the
            dashboard, where it belongs; this is the same control, shown to the
            people who can't get there. */}
        {isSinclair && (
          <div className="mb-6">
            <PushBell />
          </div>
        )}

        {/* Pipeline status tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {ORDER_STATUSES.map(s => {
            // Fallback, not decoration: this crashed the production build when
            // 'shopped' was added to ORDER_STATUSES without a matching entry
            // here ("Cannot read properties of undefined (reading 'dot')").
            // Any future status now degrades to grey instead of failing to build.
            const cfg = STATUS_CONFIG[s.value as keyof typeof STATUS_CONFIG] ?? {
              label: s.label, bg: 'bg-gray-50', text: 'text-gray-600',
              border: 'border-gray-200', dot: 'bg-gray-400', edge: 'border-l-gray-400',
            };
            const count = statusCounts[s.value] ?? 0;
            return (
              <button
                key={s.value}
                onClick={() => { setStatusFilter(statusFilter === s.value ? '' : s.value); setPage(1); }}
                className={`rounded-xl border p-3 text-left transition-all ${
                  statusFilter === s.value
                    ? `${cfg.bg} ${cfg.border} shadow-sm`
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <span className="text-xs font-semibold text-gray-500">{cfg.label}</span>
                </div>
                <p className={`text-2xl font-bold font-display ${statusFilter === s.value ? cfg.text : 'text-brand-navy'}`}>
                  {count}
                </p>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search vessel, contact, order #…"
              className="input-base pl-9"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          {statusFilter && (
            <button
              onClick={() => setStatusFilter('')}
              className="text-sm text-brand-river hover:text-brand-steel font-medium"
            >
              Clear filter ×
            </button>
          )}
        </div>

        {/* Orders table */}
        {isSinclair && (
          <div className="mb-3 rounded-xl border border-brand-gold/40 bg-white/75 px-3.5 py-3">
            <p className="text-sm font-bold text-brand-navy">After you ring an order up, tell Grafton where it went.</p>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" /> Delivered to GTS
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-emerald-900/80">You drove it down to their coolers.</p>
              </div>
              <div className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-brand-orange flex items-center gap-1.5">
                  <PackageCheck className="w-3.5 h-3.5" /> Ready for Pickup
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-orange-900/80">Boxed up at the store — a GTS driver needs to collect it.</p>
              </div>
            </div>
            <p className="mt-2 text-[12px] text-brand-navy/70">Either one tells them right away. Tapped the wrong one? Just tap the other.</p>
          </div>
        )}

        {handoffOk && (
          <div className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${HANDOFF_CONFIG[handoffOk.kind].toast}`}>
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{handoffOk.text}</span>
          </div>
        )}

        {handoffError && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <span className="flex-1">{handoffError}</span>
            <button type="button" onClick={() => setHandoffError('')} className="font-bold text-red-400 hover:text-red-600">×</button>
          </div>
        )}

        <div className="card-base overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-brand-river" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">No orders found</p>
            </div>
          ) : (<>
            {/* ── MOBILE: order cards — status visible at a glance, no scrolling ── */}
            <div className="md:hidden divide-y divide-gray-100">
              {orders.map(order => {
                const items = Array.isArray(order.items) ? order.items : [];
                const groceryItems = items.filter(i => i.item_type !== 'service');
                const groceryCount = orderItemCount(groceryItems);
                const itemCount = orderItemCount(items);
                const cfg = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.new;
                const nextSt = nextStatus(order.status, roleFlags.isGts);
                const isUpdating = updatingId === order.id;
                const hasCod = items.some(i => i.paid_by === 'cod') || !!order.extended_info?.personal_cod_notes;
                const twoStops = !!(
                  order.extended_info?.secondary_terminal_name
                  || order.extended_info?.secondary_arrival_date
                  || order.extended_info?.secondary_arrival_time
                );
                return (
                  <div key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className={`p-3.5 border-l-4 ${cfg.edge} active:bg-gray-50 cursor-pointer`}>
                    {/* Status badge FIRST — the thing Jen couldn't see without scrolling */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <StatusBadge status={order.status} />
                      <span className="text-[11px] text-gray-400 whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-brand-navy">{order.order_number}</span>
                      {!isSinclair && <span className="text-sm font-bold text-brand-navy">{formatCurrency(order.subtotal)}</span>}
                    </div>
                    <p className="text-sm font-semibold text-brand-navy truncate">{order.company_name}</p>
                    <p className="text-xs text-gray-400">
                      {order.contact_name} · {isSinclair ? `${groceryCount} grocery items` : `${itemCount} items`}
                    </p>
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      {order.crew_change === 'yes' && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-100 text-brand-orange border border-orange-200">Crew Change</span>
                      )}
                      {order.crew_change === 'maybe' && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">Crew Change?</span>
                      )}
                      {twoStops && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-brand-yellow text-brand-navy border border-brand-gold/50">
                          <MapPin className="w-2.5 h-2.5" /> 2 Stops
                        </span>
                      )}
                      {hasCod && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">$ COD</span>
                      )}
                      {!isSinclair && order.handoff && (
                        <HandoffBadge handoff={order.handoff} at={order.handoff_at} by={order.handoff_by} />
                      )}
                      {nextSt && canEditOrders && (
                        <button
                          onClick={e => { e.stopPropagation(); advanceStatus(order); }}
                          disabled={isUpdating}
                          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-brand-steel/10 text-brand-steel disabled:opacity-50">
                          {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                          {STATUS_CONFIG[nextSt]?.label}
                        </button>
                      )}
                    </div>
                    {isSinclair && order.status === 'shopped' && (
                      <div className="mt-2 pt-2 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Where did this order go?</p>
                        <HandoffButtons
                          value={order.handoff}
                          busy={handoffPending?.id === order.id}
                          busyValue={handoffPending?.value}
                          onSet={v => setHandoff(order, v)}
                          wide
                        />
                        {order.handoff && (
                          <p className={`mt-1.5 text-[11px] font-medium ${HANDOFF_CONFIG[order.handoff].text}`}>
                            {HANDOFF_CONFIG[order.handoff].help}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── DESKTOP: full table ── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-brand-navy">
                    {['Order #', 'Vessel / Company', 'Contact', isSinclair ? 'Grocery Items' : 'Items', ...(isSinclair ? [] : ['Total']), 'Date', 'Status', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-brand-sky uppercase tracking-wide whitespace-nowrap first:rounded-tl-none last:rounded-tr-none">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map(order => {
                    const items = Array.isArray(order.items) ? order.items : [];
                    const groceryItems = items.filter(i => i.item_type !== 'service');
                    const groceryCount = orderItemCount(groceryItems);
                    const itemCount = orderItemCount(items);
                    const hasCrewChange = order.crew_change === 'yes';
                    const maybeCrewChange = order.crew_change === 'maybe';
                    const hasCod = items.some(i => i.paid_by === 'cod') || !!order.extended_info?.personal_cod_notes;
                    // ⚠️ TWO STOPS CHANGES THE RUN, SO IT BELONGS IN THE QUEUE.
                    // It was only visible by opening the order, which meant
                    // scheduling a day's deliveries required opening every one
                    // of them to find out which needed two.
                    const twoStops = !!(
                      order.extended_info?.secondary_terminal_name
                      || order.extended_info?.secondary_arrival_date
                      || order.extended_info?.secondary_arrival_time
                    );
                    const hasPartsPickup = items.some(i => i.item_type === 'service' && i.service_type === 'parts_pickup');
                    const hasPkgDelivery = items.some(i => i.item_type === 'service' && i.service_type === 'package_delivery');
                    const hasOtherPickup = items.some(i => i.item_type === 'service' && i.service_type === 'other_pickup');
                    const nextSt = nextStatus(order.status, roleFlags.isGts);
                    const isUpdating = updatingId === order.id;

                    return (
                      <tr
                        key={order.id}
                        className="admin-row cursor-pointer"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-sm font-bold text-brand-navy">
                            {order.order_number}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {order.confirmation_email_sent_at ? (
                              <span title={`Confirmation sent${order.confirmation_email_sent_by ? ` · ${order.confirmation_email_sent_by}` : ''}`}
                                className="text-emerald-600"><Mail className="w-3.5 h-3.5" /></span>
                            ) : (order.confirmation_email_sent_by || '').toLowerCase().startsWith('skipped') ? (
                              <span title={order.confirmation_email_sent_by || 'Confirmation not sent'}
                                className="text-amber-600"><MailX className="w-3.5 h-3.5" /></span>
                            ) : null}
                            {order.shopped_email_sent_at && !(order.shopped_email_sent_by || '').toLowerCase().startsWith('dismissed') ? (
                              <span title={`Final email sent${order.shopped_email_sent_by ? ` · ${order.shopped_email_sent_by}` : ''}`}
                                className="text-brand-navy"><MailCheck className="w-3.5 h-3.5" /></span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-semibold text-brand-navy truncate max-w-[160px]">{order.company_name}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {hasCrewChange && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-100 text-brand-orange border border-orange-200">
                                <Users className="w-2.5 h-2.5" /> Crew Change
                              </span>
                            )}
                            {maybeCrewChange && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">
                                <Users className="w-2.5 h-2.5" /> Crew Change?
                              </span>
                            )}
                            {twoStops && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-brand-yellow text-brand-navy border border-brand-gold/50"
                                title={order.extended_info?.secondary_terminal_name
                                  ? `Second stop: ${order.extended_info.secondary_terminal_name}`
                                  : 'This order has a second stop'}>
                                <MapPin className="w-2.5 h-2.5" /> 2 Stops
                              </span>
                            )}
                            {hasCod && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                                $ COD
                              </span>
                            )}
                            {hasOtherPickup && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                                <Package className="w-2.5 h-2.5" /> Other Item
                              </span>
                            )}
                            {hasPartsPickup && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">
                                <Wrench className="w-2.5 h-2.5" /> Parts
                              </span>
                            )}
                            {hasPkgDelivery && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200">
                                <Package className="w-2.5 h-2.5" /> Package
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-600">{order.contact_name}</td>
                        <td className="px-4 py-3.5 text-sm text-center font-medium text-brand-navy">
                          {groceryCount === 0 && (hasCrewChange || maybeCrewChange || hasPartsPickup || hasPkgDelivery || hasOtherPickup)
                            ? <span className="text-xs text-gray-400 italic">services only</span>
                            : (isSinclair ? groceryCount : itemCount)
                          }
                        </td>
                        {!isSinclair && (
                          <td className="px-4 py-3.5 text-sm font-bold text-brand-navy whitespace-nowrap">
                            {formatCurrency(order.subtotal)}
                          </td>
                        )}
                        <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3.5" onClick={e => { if (isSinclair && order.status === 'shopped') e.stopPropagation(); }}>
                          <div className="flex flex-col items-start gap-1.5">
                            <StatusBadge status={order.status} />
                            {isSinclair && order.status === 'shopped' && (
                              <>
                                {!order.handoff && (
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Where did it go?</p>
                                )}
                                <HandoffButtons
                                  value={order.handoff}
                                  busy={handoffPending?.id === order.id}
                                  busyValue={handoffPending?.value}
                                  onSet={v => setHandoff(order, v)}
                                />
                              </>
                            )}
                            {!isSinclair && order.handoff && (
                              <HandoffBadge handoff={order.handoff} at={order.handoff_at} by={order.handoff_by} />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            {/* Advance pipeline button — owner/manager only */}
                            {nextSt && canEditOrders && (
                              <button
                                onClick={() => advanceStatus(order)}
                                disabled={isUpdating}
                                title={`Move to ${STATUS_CONFIG[nextSt]?.label}`}
                                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-brand-steel/10 text-brand-steel hover:bg-brand-steel hover:text-white transition-colors disabled:opacity-50"
                              >
                                {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                                {STATUS_CONFIG[nextSt]?.label}
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="p-1.5 text-gray-400 hover:text-brand-river transition-colors"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => printPickSheet(order)}
                              className="p-1.5 text-gray-400 hover:text-brand-river transition-colors"
                              title="Print Pick Sheet (barcodes)"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => downloadOrderPdf(order.id, order.order_number)}
                              className="p-1.5 text-gray-400 hover:text-brand-river transition-colors"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            {canDeleteOrder(order.order_number) && (
                              <button
                                onClick={() => deleteOrder(order.id, order.order_number)}
                                disabled={deletingId === order.id}
                                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                title={order.order_number.startsWith('IMP-') ? 'Remove imported order' : 'Delete Order'}
                              >
                                {deletingId === order.id
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <Trash2 className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>)}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-outline text-sm px-4 py-2 disabled:opacity-40">← Prev</button>
            <span className="px-4 py-2 text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-outline text-sm px-4 py-2 disabled:opacity-40">Next →</button>
          </div>
        )}

        {confirmDialogEl}

        {/* In-app barcode pick sheet */}
        {pickSheetOrder && (
          <PickSheetOverlay
            orderId={pickSheetOrder.id}
            orderNumber={pickSheetOrder.number}
            onClose={() => setPickSheetOrder(null)}
          />
        )}

        {/* Order detail / shopping-mode modal (Sinclair push deep-link uses shop=1) */}
        {selectedOrder && deepLinkShop && (
          <ShoppingModeModal
            order={selectedOrder}
            onClose={() => { setSelectedOrder(null); setDeepLinkShop(false); fetchOrders(); }}
            onComplete={() => { setSelectedOrder(null); setDeepLinkShop(false); fetchOrders(); }}
          />
        )}
        {selectedOrder && !deepLinkShop && (
          <OrderDetailModal
            order={selectedOrder}
            onClose={() => { setSelectedOrder(null); setDeepLinkShop(false); }}
            onStatusChange={(status) => updateStatus(selectedOrder.id, status)}
            onDownloadPdf={() => downloadOrderPdf(selectedOrder.id, selectedOrder.order_number)}
            onRefresh={fetchOrders}
            canEdit={canEditOrders}
            isOwner={isOwner}
            canDelete={canDeleteOrder(selectedOrder.order_number)}
            deleting={deletingId === selectedOrder.id}
            onDelete={() => deleteOrder(selectedOrder.id, selectedOrder.order_number)}
            isSinclairScoped={isSinclair}
          />
        )}
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense>
      <OrdersContent />
    </Suspense>
  );
}
