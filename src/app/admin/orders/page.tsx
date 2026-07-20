'use client';
// src/app/admin/orders/page.tsx
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Download, Eye, Loader2, RefreshCw, Package, ArrowRight, Trash2, Users, Wrench, Printer } from 'lucide-react';
import { PickSheetOverlay } from '@/components/admin/PickSheetOverlay';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatCurrency, formatDate, ORDER_STATUSES } from '@/lib/utils';
import { Order, OrderStatus } from '@/types';
import { OrderDetailModal } from '@/components/admin/OrderDetailModal';
import { fetchAdminSession, getAdminRole, canEdit, adminFetch, hasAdminPermission } from '@/lib/admin-auth';

const STATUS_CONFIG = {
  new:         { label: 'New',         bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',  dot: 'bg-blue-500',  edge: 'border-l-blue-500'  },
  in_progress: { label: 'In Progress', bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200', dot: 'bg-amber-500', edge: 'border-l-amber-500' },
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

// Pipeline: next status after current
const NEXT_STATUS: Record<string, OrderStatus | null> = {
  new: 'in_progress',
  in_progress: 'fulfilled',
  fulfilled: null,
  cancelled: null,
};

function OrdersContent() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Role-gated UI is resolved AFTER mount — reading localStorage during render
  // makes the client's first paint differ from the server HTML (hydration #418).
  const [roleFlags, setRoleFlags] = useState({ canEditOrders: false, isOwner: false, isSinclair: false });
  useEffect(() => {
    setRoleFlags({
      canEditOrders: canEdit(getAdminRole(), 'orders'),
      isOwner: getAdminRole() === 'owner',
      isSinclair: hasAdminPermission('sinclair'),
    });
  }, []);
  const { canEditOrders, isOwner, isSinclair } = roleFlags;
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
      let fetchedOrders: Order[] = data.orders || [];
      // Sinclair users see orders sorted by arrival date (soonest first)
      if (isSinclair) {
        fetchedOrders = [...fetchedOrders].sort((a, b) => {
          if (!a.arrival_date && !b.arrival_date) return 0;
          if (!a.arrival_date) return 1;
          if (!b.arrival_date) return -1;
          return a.arrival_date.localeCompare(b.arrival_date);
        });
      }
      setOrders(fetchedOrders);
      setTotal(data.total || 0);
      setStatusCounts(data.status_counts || {});
    }
    setLoading(false);
  }, [page, search, statusFilter, isSinclair]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  async function advanceStatus(order: Order) {
    const next = NEXT_STATUS[order.status];
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

  async function downloadOrderCsv(order: Order) {
    const rows = [
      ['Order Number', 'Company', 'Contact', 'Phone', 'Date', 'Status', 'Total'],
      [order.order_number, order.company_name, order.contact_name, order.phone,
       new Date(order.created_at).toLocaleDateString(), order.status, order.subtotal],
      [],
      ['Description', 'Category', 'Pack Size', 'Qty', 'Unit Price', 'Line Total'],
      ...order.items.map(i => [i.description, i.category, i.pkg_size || '', i.quantity, i.unit_price, i.line_total]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${order.order_number}.csv`; a.click();
    URL.revokeObjectURL(url);
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
          <button onClick={fetchOrders} className="btn-outline text-sm px-3 py-2 flex items-center gap-1.5 self-start">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Pipeline status tabs */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {ORDER_STATUSES.map(s => {
            const cfg = STATUS_CONFIG[s.value as keyof typeof STATUS_CONFIG];
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
                const groceryCount = groceryItems.reduce((s, i) => s + i.quantity, 0);
                const itemCount = items.reduce((s, i) => s + i.quantity, 0);
                const cfg = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.new;
                const nextStatus = NEXT_STATUS[order.status];
                const isUpdating = updatingId === order.id;
                const hasCod = items.some(i => i.paid_by === 'cod') || !!order.extended_info?.personal_cod_notes;
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
                      {hasCod && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">$ COD</span>
                      )}
                      {nextStatus && canEditOrders && (
                        <button
                          onClick={e => { e.stopPropagation(); advanceStatus(order); }}
                          disabled={isUpdating}
                          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-brand-steel/10 text-brand-steel disabled:opacity-50">
                          {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                          {STATUS_CONFIG[nextStatus]?.label}
                        </button>
                      )}
                    </div>
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
                    const groceryCount = groceryItems.reduce((s, i) => s + i.quantity, 0);
                    const itemCount = items.reduce((s, i) => s + i.quantity, 0);
                    const hasCrewChange = order.crew_change === 'yes';
                    const maybeCrewChange = order.crew_change === 'maybe';
                    const hasCod = items.some(i => i.paid_by === 'cod') || !!order.extended_info?.personal_cod_notes;
                    const hasPartsPickup = items.some(i => i.item_type === 'service' && i.service_type === 'parts_pickup');
                    const hasPkgDelivery = items.some(i => i.item_type === 'service' && i.service_type === 'package_delivery');
                    const hasOtherPickup = items.some(i => i.item_type === 'service' && i.service_type === 'other_pickup');
                    const nextStatus = NEXT_STATUS[order.status];
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
                        <td className="px-4 py-3.5">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            {/* Advance pipeline button — owner/manager only */}
                            {nextStatus && canEditOrders && (
                              <button
                                onClick={() => advanceStatus(order)}
                                disabled={isUpdating}
                                title={`Move to ${STATUS_CONFIG[nextStatus]?.label}`}
                                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-brand-steel/10 text-brand-steel hover:bg-brand-steel hover:text-white transition-colors disabled:opacity-50"
                              >
                                {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                                {STATUS_CONFIG[nextStatus]?.label}
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
                            {isOwner && (
                              <button
                                onClick={() => deleteOrder(order.id, order.order_number)}
                                disabled={deletingId === order.id}
                                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                title="Delete Order"
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

        {/* Order detail modal */}
        {selectedOrder && (
          <OrderDetailModal
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onStatusChange={(status) => updateStatus(selectedOrder.id, status)}
            onDownloadPdf={() => downloadOrderPdf(selectedOrder.id, selectedOrder.order_number)}
            onDownloadCsv={() => downloadOrderCsv(selectedOrder)}
            onRefresh={fetchOrders}
            canEdit={canEditOrders}
            isOwner={isOwner}
            deleting={deletingId === selectedOrder.id}
            onDelete={() => deleteOrder(selectedOrder.id, selectedOrder.order_number)}
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
