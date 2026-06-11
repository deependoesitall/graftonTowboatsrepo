'use client';
// src/app/admin/orders/page.tsx
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Download, Eye, Loader2, RefreshCw, Package, ArrowRight } from 'lucide-react';
import { formatCurrency, formatDate, ORDER_STATUSES } from '@/lib/utils';
import { Order, OrderStatus } from '@/types';
import { OrderDetailModal } from '@/components/admin/OrderDetailModal';
import { ADMIN_TOKEN_KEY, getAdminRole, canEdit, adminHeaders } from '@/lib/admin-auth';

const STATUS_CONFIG = {
  new:         { label: 'New',         bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',  dot: 'bg-blue-500'   },
  in_progress: { label: 'In Progress', bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200', dot: 'bg-amber-500'  },
  fulfilled:   { label: 'Fulfilled',   bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200', dot: 'bg-green-500'  },
  cancelled:   { label: 'Cancelled',   bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200',   dot: 'bg-red-400'    },
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

  const adminToken = typeof window !== 'undefined' ? sessionStorage.getItem(ADMIN_TOKEN_KEY) || '' : '';
  const canEditOrders = canEdit(typeof window !== 'undefined' ? getAdminRole() : null, 'orders');

  // Auth guard
  useEffect(() => {
    if (!sessionStorage.getItem(ADMIN_TOKEN_KEY)) router.push('/admin');
  }, [router]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('per_page', '25');
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);

    const res = await fetch(`/api/orders?${params.toString()}`, {
      headers: { 'x-admin-token': adminToken },
    });
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders || []);
      setTotal(data.total || 0);
      setStatusCounts(data.status_counts || {});
    }
    setLoading(false);
  }, [page, search, statusFilter, adminToken]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  async function advanceStatus(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setUpdatingId(order.id);
    await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: next }),
    });
    await fetchOrders();
    setUpdatingId(null);
    // Update selected order if open
    if (selectedOrder?.id === order.id) {
      setSelectedOrder(prev => prev ? { ...prev, status: next } : null);
    }
  }

  async function updateStatus(orderId: string, status: OrderStatus) {
    // Optimistic update so the modal dropdown reflects the change immediately
    setSelectedOrder(prev => prev && prev.id === orderId ? { ...prev, status } : prev);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));

    await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status }),
    });
    fetchOrders();
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
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-brand-navy">
                    {['Order #', 'Vessel / Company', 'Contact', 'Items', 'Total', 'Date', 'Status', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-brand-sky uppercase tracking-wide whitespace-nowrap first:rounded-tl-none last:rounded-tr-none">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map(order => {
                    const itemCount = Array.isArray(order.items) ? order.items.reduce((s, i) => s + i.quantity, 0) : 0;
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
                          <p className="text-xs text-gray-400">{order.phone}</p>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-600">{order.contact_name}</td>
                        <td className="px-4 py-3.5 text-sm text-center font-medium text-brand-navy">{itemCount}</td>
                        <td className="px-4 py-3.5 text-sm font-bold text-brand-navy whitespace-nowrap">
                          {formatCurrency(order.subtotal)}
                        </td>
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
                              onClick={() => downloadOrderPdf(order.id, order.order_number)}
                              className="p-1.5 text-gray-400 hover:text-brand-river transition-colors"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-outline text-sm px-4 py-2 disabled:opacity-40">← Prev</button>
            <span className="px-4 py-2 text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-outline text-sm px-4 py-2 disabled:opacity-40">Next →</button>
          </div>
        )}

        {/* Order detail modal */}
        {selectedOrder && (
          <OrderDetailModal
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onStatusChange={(status) => updateStatus(selectedOrder.id, status)}
            onDownloadPdf={() => downloadOrderPdf(selectedOrder.id, selectedOrder.order_number)}
            onDownloadCsv={() => downloadOrderCsv(selectedOrder)}
            adminToken={adminToken}
            onRefresh={fetchOrders}
            canEdit={canEditOrders}
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
